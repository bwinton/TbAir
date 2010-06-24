/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Home Tab.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Blake Winton <bwinton@latte.ca>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://app/modules/virtualFolderWrapper.js");

// -- Import modules we need.
Cu.import("resource://app/modules/gloda/public.js");
Cu.import("resource:///modules/gloda/utils.js");
Cu.import("resource:///modules/gloda/mimemsg.js");
Cu.import("resource:///modules/templateUtils.js");
Cu.import("resource://app/modules/MailUtils.js");
Cu.import("resource://app/modules/errUtils.js");
Cu.import("resource:///modules/iteratorUtils.jsm");

Cu.import("resource://hometab/modules/hometabSessionManager.js");

let msgComposeService = Components.classes['@mozilla.org/messengercompose;1'].getService()
                                  .QueryInterface(Components.interfaces.nsIMsgComposeService);

let messenger = Components.classes["@mozilla.org/messenger;1"].createInstance()
                          .QueryInterface(Components.interfaces.nsIMessenger);

let msgWindow = Components.classes["@mozilla.org/messenger/msgwindow;1"].createInstance()
                          .QueryInterface(Components.interfaces.nsIMsgWindow);

let accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"]
                               .getService(Components.interfaces.nsIMsgAccountManager)


var hometab = {

  /**
   * This is a helper attribute that simply returns a flat list of all folders
   */
  get _enumerateFolders() {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    let folders = [];

    let acctMgr = Cc["@mozilla.org/messenger/account-manager;1"]
                     .getService(Ci.nsIMsgAccountManager);
    for each (let acct in fixIterator(acctMgr.accounts, Ci.nsIMsgAccount)) {
      // Skip deferred accounts
      if (acct.incomingServer instanceof Ci.nsIPop3IncomingServer &&
          acct.incomingServer.deferredToAccount)
        continue;
      folders.push(acct.incomingServer.rootFolder);
      this.addSubFolders(acct.incomingServer.rootFolder, folders);
    }
    return folders;
  },

  /**
   * This is a recursive function to add all subfolders to the array. It
   * assumes that the passed in folder itself has already been added.
   *
   * @param aFolder  the folder whose subfolders should be added
   * @param folders  the array to add the folders to.
   */
  addSubFolders : function addSubFolders (folder, folders) {
    for each (let f in fixIterator(folder.subFolders, Components.interfaces.nsIMsgFolder)) {
      folders.push(f);
      this.addSubFolders(f, folders);
    }
  },

  showFolders: function showFolders(doc) {
    doc.setupHome();
    let content = [];
    const outFolderFlagMask = Ci.nsMsgFolderFlags.Queue |
                              Ci.nsMsgFolderFlags.Templates |
                              Ci.nsMsgFolderFlags.Newsgroup;

    let seenFolderNames = {};
    for each (let folder in this._enumerateFolders) {
      if (!folder.isSpecialFolder(outFolderFlagMask, true) &&
          (folder.server && folder.server.type != "rss") &&
          (folder.server && folder.server.type != "nntp") &&
          (!folder.isServer && folder.getTotalMessages(true) > 0)) {
        let _unread = folder.getNumUnread(false);
        let data = {name: folder.name,
                    serverName: folder.server.prettyName,
                    read: (_unread <= 0),
                    unread: (_unread || ""),
                    dupe : false,
                    id: folder.URI};
        if (folder.name in seenFolderNames) {
          let prevData = seenFolderNames[folder.name];
          if (prevData)
            prevData.dupe = true;
          data.dupe = true;
        }
        else {
          seenFolderNames[folder.name] = data;
        }
        content.push(data);
      }
    }
    doc.setHeaderTitle("Home")
    doc.setFolders(sortFolderItems(content));
  },

  showConversations: function show_Conversations(aId, aBackground) {
    let tabmail = document.getElementById("tabmail");
    tabmail.openTab("folderList", {
      id: aId,
      background: aBackground
    });
  },

  showMessages: function showMessages(aId, aSubject, aBackground) {
    openSubTab("messageList", {
      id: aId,
      title: aSubject,
      background : aBackground
    });
  },

  tempFolder: null,

  populateMessageBody: function populateMessageBody(aWin, aMessageHeader) {
    try {
    let messenger = Cc["@mozilla.org/messenger;1"]
                      .createInstance(Ci.nsIMessenger);
    let listener = Cc["@mozilla.org/network/sync-stream-listener;1"]
                     .createInstance(Ci.nsISyncStreamListener);
    let uri = aMessageHeader.folderMessageURI;
    let self = this;
    let neckoURL = {};
    messenger.messageServiceFromURI(uri).GetUrlForUri(uri, neckoURL, null);
    let iframe = document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "iframe");
    iframe.setAttribute("type", "content");
    iframe.setAttribute("id", aMessageHeader.id);
    /* The xul:iframe automatically loads about:blank when it is added
     * into the tree. We need to wait for the document to be loaded before
     * doing things.
     *
     * Why do we do that ? Basically because we want the <xul:iframe> to
     * have a docShell and a webNavigation. If we don't do that, and we
     * set directly src="about:blank" in the XML above, sometimes we are
     * too fast and the docShell isn't ready by the time we get there. */
    iframe.addEventListener("load", function f_temp2(event) {
      iframe.removeEventListener("load", f_temp2, true);

      /* The second load event is triggered by loadURI with the URL
       * being the necko URL to the given message. */
      iframe.addEventListener("load", function f_temp1(event) {
        iframe.removeEventListener("load", f_temp1, true);

        /* The part below is all about quoting */
        let iframeDoc = iframe.contentDocument;
        self.tempFolder = iframeDoc;
        aWin.populateMessageBody(aMessageHeader.id, iframeDoc);
        /* And remove ourselves. */
        document.getElementById("mailContent").removeChild(iframe);

        /* Here ends the chain of event listeners, nothing happens
         * after this. */
        }, true); /* end document.addEventListener */

      let url = neckoURL.value;

      let cv = iframe.docShell.contentViewer;
      cv.QueryInterface(Ci.nsIMarkupDocumentViewer);
      cv.hintCharacterSet = "UTF-8";
      cv.hintCharacterSetSource = 10; // kCharsetFromMetaTag
      iframe.docShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
      iframe.webNavigation.loadURI(url.spec+"?header=quotebody",
                                   iframe.webNavigation.LOAD_FLAGS_IS_LINK,
                                   null, null, null);
    }, true); /* end document.addEventListener */
    document.getElementById("mailContent").appendChild(iframe);
    } catch (e) {
      dump("\n\nCaught error in populateMessageBody.  e="+e+"\n");
      dump(e.stack);
      dump("\n");
    }
  },

  _isRealAttachment: function hometab_isRealAttachment(attachment) {
    let FAKE_ATTACHMENT_NAMES = { "signature.asc" : true }
    return attachment.isRealAttachment && ! (attachment.name in FAKE_ATTACHMENT_NAMES);
  },

  populateAttachment: function hometab_populateAttachment(aMsgHdr, aMimeMsg) {
    //Get all the URLs for images
    let attachments = new Array();
    for (let [,attachment] in Iterator(aMimeMsg.allAttachments)) {
      attachments.push({ name : attachment.name,
                         url : attachment.url,
                         uri : aMsgHdr.folder.getUriForMsg(aMsgHdr),
                         fullType : attachment.contentType,
                         isExternal : attachment.isExternal,
                         isReal : hometab._isRealAttachment(attachment) });
    }
    // we use the messageKey because it's the cheapest item that both the
    // GlodaMessage and nsIMsgDBHdr have
    this.populateAttachment(aMsgHdr.messageKey, attachments)
  },

  openAttachment: function(aAttachmentElement) {
    openSubTab("contentTab", {
      contentPage : aAttachmentElement.attr("url"),
      title : aAttachmentElement.attr("name"),
    });
  },

  _augmentMessage: function (message) {
    message.friendlyDate = makeFriendlyDateAgo(message.date);
    message.synopsis = (message.indexedBodyText || "").substr(0, 140);
    message.avatar = "http://www.gravatar.com/avatar/" +
                     GlodaUtils.md5HashString(message.from.value) +
                     "?d=monsterid&s=16&r=g";
    message.attachments = [{ name: attachment,
                             type : { type : message.attachmentTypes[i]._type,
                                      subType : message.attachmentTypes[i].subType,
                                      fullType : message.attachmentTypes[i].fullType
                                    },
                             categoryLabel : message.attachmentTypes[i].categoryLabel,
                             category : message.attachmentTypes[i].category,
                             url : null, /* attachment location */
                             uri : null  /* message location */
                           }
                           for each([i,attachment] in
                                    Iterator(message.attachmentNames || []))
                           ];
  },

  addMessages: function addMessages(aWin, aMessages) {
    //Lay down the message structure
    aWin.addMessages(aMessages);

    let readMessages = [];
    let unreadAttachments = [], readAttachments = [];
    //First lets handle the unread messages
    for each(let [i,message] in Iterator(aMessages)) {
      if (!message.read) {
        this.populateMessageBody(aWin, message);
        if (message.attachments.length > 0)
          unreadAttachments.push(message);
      }
      else {
        readMessages.push(message);
        if (message.attachments.length > 0)
          readAttachments.push(message);
      }
    }

    // Now stream in the unread attachments
    for each(let [i,message] in Iterator(unreadAttachments)) {
      let msgHdr = message.folderMessage;
      if (msgHdr)
        MsgHdrToMimeMessage(msgHdr, aWin, this.populateAttachment,
                            true /*Allow Download*/, {});
    }

    // Now stream in the read messages
    for each(let [i,message] in Iterator(readMessages)) {
      this.populateMessageBody(aWin, message);
    }

    // Finally grab all the attachments
    for each(let [i,message] in Iterator(readAttachments)) {
      let msgHdr = message.folderMessage;
      if (msgHdr)
        MsgHdrToMimeMessage(msgHdr, aWin, this.populateAttachment,
                            true /*Allow Download*/, {});
    }

  },

  showMessagesInConversation: function showMessagesInConversation(aWin) {
    let id = aWin.tab.id;
    if (aWin.tab.results != null) {
      this.addMessages(aWin, aWin.tab.results);
      return;
    }
    let self = this;
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    query.conversation(id)
    query.orderBy("date");
    query.getCollection({
      onItemsAdded: function _onItemsAdded(aItems, aCollection) {
      },
      onItemsModified: function _onItemsModified(aItems, aCollection) {
      },
      onItemsRemoved: function _onItemsRemoved(aItems, aCollection) {
      },
      /* called when our database query completes */
      onQueryCompleted: function _onQueryCompleted(messages) {
        aWin.tab.results = [];
        let items = self._removeDupes(messages.items);
        let involves = {};
        let isList = ("mailingLists" in items[0] && items[0].mailingLists.length > 0)
        for each(var [,message] in Iterator(items)) {
          self._augmentMessage(message);
          // because this could slow things down a bit we only do it for list messages
          if (isList) {
            for each(let id in message.involves)
              involves[id.id] = id;
          }
          aWin.tab.results.push(message);
        }
        self.addMessages(aWin, aWin.tab.results);
        aWin.setHeaderTitle(items[0].conversation.subject);
        //We can assume this is the conversation topic even though it is not guaranteed
        aWin.addParticipants(items[0], involves);
      }});
  },

  _removeDupes: function(aItems) {
    let deduped = [];
    let msgIdsSeen = {};
    for each (let [, item] in Iterator(aItems)) {
      if (item.headerMessageID in msgIdsSeen)
        continue;
      deduped.push(item);
      msgIdsSeen[item.headerMessageID] = true;
    }
    return deduped;
  },

  replyMessage: function(folderMessageURI, folderURI) {
    let folder = MailUtils.getFolderForURI(folderURI, true);
    ComposeMessage(Components.interfaces.nsIMsgCompType.ReplyToSender,
                   Components.interfaces.nsIMsgCompFormat.Default,
                   folder, [folderMessageURI]);
  },
  replyAllMessage: function(folderMessageURI, folderURI) {
    let folder = MailUtils.getFolderForURI(folderURI, true);
    ComposeMessage(Components.interfaces.nsIMsgCompType.ReplyAll,
                   Components.interfaces.nsIMsgCompFormat.Default,
                   folder, [folderMessageURI]);
  },

  composeMessage: function(email) {
    Application.console.log("composeMessage: " + email);
    let fields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
                           .createInstance(Components.interfaces.nsIMsgCompFields);
    fields.to = email;
    let params = Components.classes["@mozilla.org/messengercompose/composeparams;1"]
                           .createInstance(Components.interfaces.nsIMsgComposeParams);
    params.composeFields = fields;
    params.type = Components.interfaces.nsIMsgCompType.New;
    params.format = Components.interfaces.nsIMsgCompFormat.Default;
    msgComposeService.OpenComposeWindowWithParams(null, params);
  },

  showContacts: function(aBackground) {
    let tabmail = document.getElementById("tabmail");
    tabmail.openTab("contacts", {
      background: aBackground
    });

  },

  showContactsInTab: function(aWin) {
    let contactQuery = Gloda.newQuery(Gloda.NOUN_CONTACT);
    contactQuery.orderBy("-popularity").limit(50);
    contactQuery.getCollection({
      onItemsAdded: function _onItemsAdded(aItems, aCollection) {
      },
      onItemsModified: function _onItemsModified(aItems, aCollection) {
      },
      onItemsRemoved: function _onItemsRemoved(aItems, aCollection) {
      },
      onQueryCompleted: function _onQueryCompleted(contacts) {
        let others = [];
        for each(let [,contact] in Iterator(contacts.items)) {
          if (Gloda.myContact != contact) {
            for each(let [,identity] in Iterator(contact.identities)) {
              if ("email" == identity.kind) {
                contact.avatar = "http://www.gravatar.com/avatar/" +
                                 GlodaUtils.md5HashString(identity.value) +
                                 "?d=monsterid&s=48&r=g";
                break;
              }
            }
            others.push(contact);
          }
        }
        aWin.addContacts(Gloda.myContact, others);
        aWin.setHeaderTitle(aWin.tab.title);
      }});
  },

  showSource: function show_Source(aBackground) {
    let tabmail = document.getElementById("tabmail");
    tabmail.openTab("source", { background: aBackground });
  }
};

/**
 * A tab to show content pages.
 */
var contentTabType = {
  name: "contentTab",
  perTabPanel: "vbox",
  lastBrowserId: 0,

  modes: {
    contentTab: {
      type: "contentTab",

      openTab: function ct_onTabOpened(aTab, aArgs) {
        if (!"contentPage" in aArgs)
          throw("contentPage must be specified");

        // Clone the browser for our new tab.
        aTab.title = aArgs.title;
        aTab.browser = document.getElementById("browser").cloneNode(true);
        aTab.browser.setAttribute("id", "contentTab"+this.lastBrowserId);
        aTab.panel.appendChild(aTab.browser);
        aTab.browser.setAttribute("type", aArgs.background ? "content-targetable" :
                                                             "content-primary");
        aTab.browser.loadURI(aArgs.contentPage);

        this.lastBrowserId++;
      },

      shouldSwitchTo: function ct_onSwitchTo({contentPage: aContentPage}) {
        let tabmail = document.getElementById("tabmail");
        let tabInfo = tabmail.tabInfo;

        // Remove any anchors - especially for the about: pages, we just want
        // to re-use the same tab.
        let regEx = new RegExp("#.*");

        let contentUrl = aContentPage.replace(regEx, "");

        for (let selectedIndex = 0; selectedIndex < tabInfo.length;
             ++selectedIndex) {
          if (tabInfo[selectedIndex].mode.name == this.name &&
              tabInfo[selectedIndex].browser.currentURI.spec
                                    .replace(regEx, "") == contentUrl) {
            // Ensure we go to the correct location on the page.
            tabInfo[selectedIndex].browser
                                  .setAttribute("src", aContentPage);
            return selectedIndex;
          }
        }
        return -1;
      },

      closeTab: function ct_onTabClosed(aTab) {},

      saveTabState: function ct_onSaveTabState(aTab) {
        aTab.browser.setAttribute("type", "content-targetable");
      },

      showTab: function ct_onShowTab(aTab) {
        aTab.browser.setAttribute("type", "content-primary");
      },

      persistTab: function ct_onPersistTab(aTab) {
        if (aTab.browser.currentURI.spec == "about:blank")
          return null;

        return {
          tabURI: aTab.browser.currentURI.spec,
        };
      },

      restoreTab: function ct_onRestoreTab(aTabmail, aPersistedState) {
        aTabmail.openTab("contentTab", { contentPage: aPersistedState.tabURI,
                                         background: true } );
      },

      supportsCommand: function ct_supportsCommand(aCommand, aTab) {
        switch (aCommand) {
          case "cmd_fullZoomReduce":
          case "cmd_fullZoomEnlarge":
          case "cmd_fullZoomReset":
          case "cmd_fullZoomToggle":
          case "cmd_find":
          case "cmd_findAgain":
          case "cmd_findPrevious":
          case "cmd_printSetup":
          case "cmd_print":
          case "button_print":
          case "cmd_stop":
          case "cmd_reload":
          // XXX print preview not currently supported - bug 497994 to implement.
          // case "cmd_printpreview":
            return true;
          default:
            return false;
        }
      },

      isCommandEnabled: function ct_isCommandEnabled(aCommand, aTab) {
        switch (aCommand) {
          case "cmd_fullZoomReduce":
          case "cmd_fullZoomEnlarge":
          case "cmd_fullZoomReset":
          case "cmd_fullZoomToggle":
          case "cmd_find":
          case "cmd_findAgain":
          case "cmd_findPrevious":
          case "cmd_printSetup":
          case "cmd_print":
          case "button_print":
          // XXX print preview not currently supported - bug 497994 to implement.
          // case "cmd_printpreview":
            return true;
          case "cmd_reload":
            return aTab.reloadEnabled;
          case "cmd_stop":
            return aTab.busy;
          default:
            return false;
        }
      },

      doCommand: function ct_isCommandEnabled(aCommand, aTab) {
        switch (aCommand) {
          case "cmd_fullZoomReduce":
            ZoomManager.reduce();
            break;
          case "cmd_fullZoomEnlarge":
            ZoomManager.enlarge();
            break;
          case "cmd_fullZoomReset":
            ZoomManager.reset();
            break;
          case "cmd_fullZoomToggle":
            ZoomManager.toggleZoom();
            break;
          case "cmd_find":
            aTab.findbar.onFindCommand();
            break;
          case "cmd_findAgain":
            aTab.findbar.onFindAgainCommand(false);
            break;
          case "cmd_findPrevious":
            aTab.findbar.onFindAgainCommand(true);
            break;
          case "cmd_printSetup":
            PrintUtils.showPageSetup();
            break;
          case "cmd_print":
            PrintUtils.print();
            break;
          // XXX print preview not currently supported - bug 497994 to implement.
          //case "cmd_printpreview":
          //  PrintUtils.printPreview();
          //  break;
          case "cmd_stop":
            aTab.browser.stop();
            break;
          case "cmd_reload":
            aTab.browser.reload();
            break;
        }
      },

      getBrowser: function ct_getBrowser(aTab) {
        return aTab.browser;
      },
    },
  },
};

var homeTabType = {
  // TabType attributes
  name: "HomeTab",
  perTabPanel: "vbox",
  panelId: "mailContent",
  modes: {
    // "home" tab type.
    home: {
      type: "home",
      isDefault: true,

      openFirstTab: function ht_openTab(aTab, aArgs) {
        aTab.title = "Home";
      },

      openTab: function ht_openTab(aTab, aArgs) {
      },

      htmlLoadHandler: function ht_htmlLoadHandler(aContentWindow) {
        hometab.showFolders(aContentWindow);
      },

      showTab: function ht_showTab(aTab) {
        window.title = aTab.title;
      },

      onTitleChanged: function ht_onTitleChanged(aTab) {
        window.title = aTab.title;
      },
      closeTab: function ht_closeTab(aTab) {
      },
      saveTabState: function ht_saveTabState(aTab) {
      },
      persistTab: function ht_persistTab(aTab) {
      },
      restoreTab: function ht_restoreTab(aTabmail, aPersistedState) {
      },
      supportsCommand: function ht_supportsCommand(aCommand, aTab) {
        return false;
      },
      isCommandEnabled: function ht_isCommandEnabled(aCommand, aTab) {
        return false;
      },
      doCommand: function ht_doCommand(aCommand, aTab) {
      },
      onEvent: function ht_onEvent(aEvent, aTab) {
      },
      getBrowser: function ht_getBrowser(aCommand, aTab) {
        return null;
      },
    },

    // "folderList" tab type.
    folderList: {
      type: "folderList",
      isDefault: false,
      listeners : {},

      openTab: function fl_openTab(aTab, aArgs) {
        let folder = MailUtils.getFolderForURI(aArgs.id, true);
        aTab.folder = folder;
        aTab.tabNode.setAttribute("read", (folder.getNumUnread(false) <= 0));
        aTab.id = aArgs.id;
        aTab.title = folder.prettyName;

        // Clone the browser for our new tab.
        aTab.browser = document.getElementById("browser").cloneNode(true);
        aTab.browser.setAttribute("id", "folderList"+aTab.id);
        aTab.panel.appendChild(aTab.browser);
        aTab.browser.contentWindow.tab = aTab;
        aTab.browser.contentWindow.title = aArgs.title;
        aTab.browser.setAttribute("type", aArgs.background ? "content-targetable" :
                                                             "content-primary");
        homeTabType.modes.folderList.listeners[aArgs.id] = new folderCollectionListener(aTab.browser.contentWindow, aTab, folder);

        aTab.browser.loadURI("chrome://hometab/content/folderView.html");
      },

      htmlLoadHandler: function ml_htmlLoadHandler(aContentWindow) {
        aContentWindow.tab.tabNode.setAttribute("loaded", true);

        let folder = aContentWindow.tab.folder;
        //let t0 = new Date();
        let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);

        if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
          let vFolder = new VirtualFolderHelper.wrapVirtualFolder(folder)
          query.folder.apply(query, vFolder.searchFolders);
        }
        else {
          query.folder(folder);
        }
        query.orderBy("-date");
        query.limit(50);
        //let t1 = new Date();
        query.getCollection(homeTabType.modes.folderList.listeners[folder.URI]);
      },

      showTab: function fl_showTab(aTab) {
        window.title = aTab.title;
        aTab.browser.setAttribute("type", "content-primary");
      },
      shouldSwitchTo: function onSwitchTo({id: aFolder}) {
        let tabInfo = document.getElementById("tabmail").tabInfo;

        for (let selectedIndex = 0; selectedIndex < tabInfo.length;
             ++selectedIndex) {
          if (tabInfo[selectedIndex].mode.name == this.modes.folderList.type &&
              tabInfo[selectedIndex].id &&
              tabInfo[selectedIndex].id == aFolder) {
            return selectedIndex;
          }
        }
        return -1;
      },

      onTitleChanged: function fl_onTitleChanged(aTab) {
        window.title = aTab.title;
      },
      closeTab: function fl_closeTab(aTab) {
        delete homeTabType.modes.folderList.listeners[aTab.id];
        aTab.browser.destroy();
      },
      saveTabState: function fl_saveTabState(aTab) {
        aTab.browser.setAttribute("type", "content-targetable");
      },
      persistTab: function fl_persistTab(aTab) {
        return { folderURI: aTab.id };
      },
      restoreTab: function fl_restoreTab(aTabmail, aPersistedState) {
        aTabmail.openTab("folderList", { id : aPersistedState.folderURI,
                                         background: true });
      },
      supportsCommand: function fl_supportsCommand(aCommand, aTab) {
        return false;
      },
      isCommandEnabled: function fl_isCommandEnabled(aCommand, aTab) {
        return false;
      },
      doCommand: function fl_doCommand(aCommand, aTab) {
      },
      onEvent: function fl_onEvent(aEvent, aTab) {
      },
      getBrowser: function fl_getBrowser(aCommand, aTab) {
        return aTab.browser;
      },
    },

    // "messageList" tab type.
    messageList: {
      type: "messageList",
      isDefault: false,

      openTab: function ml_openTab(aTab, aArgs) {
        aTab.title = aArgs.title;
        aTab.id = aArgs.id;
        window.title = aTab.title;

        // Clone the browser for our new tab.
        aTab.browser = document.getElementById("browser").cloneNode(true);
        aTab.browser.setAttribute("id", "messageList"+aTab.id);
        aTab.panel.appendChild(aTab.browser);
        aTab.browser.contentWindow.tab = aTab;
        aTab.browser.contentWindow.title = aArgs.title;
        aTab.browser.setAttribute("type", aArgs.background ? "content-targetable" :
                                                             "content-primary");
        aTab.browser.loadURI("chrome://hometab/content/conversationView.html");
      },

      htmlLoadHandler: function ml_htmlLoadHandler(aContentWindow) {
        aContentWindow.tab.tabNode.setAttribute("loaded", true);
        hometab.showMessagesInConversation(aContentWindow);
      },

      showTab: function ml_showTab(aTab) {
        window.title = aTab.title;
        aTab.browser.setAttribute("type", "content-primary");
      },
      shouldSwitchTo: function onSwitchTo({id: aConversation}) {
        let tabInfo = document.getElementById("tabmail").tabInfo;

        for (let selectedIndex = 0; selectedIndex < tabInfo.length;
             ++selectedIndex) {
          if (tabInfo[selectedIndex].mode.name == this.modes.messageList.type &&
              tabInfo[selectedIndex].id &&
              tabInfo[selectedIndex].id == aConversation) {
            return selectedIndex;
          }
        }
        return -1;
      },
      onTitleChanged: function ml_onTitleChanged(aTab) {
        window.title = aTab.title;
      },
      closeTab: function ml_closeTab(aTab) {
        aTab.browser.destroy();
      },
      saveTabState: function ml_saveTabState(aTab) {
        aTab.browser.setAttribute("type", "content-targetable");
      },
      persistTab: function ml_persistTab(aTab) {
        return { conversationId: aTab.id, title : aTab.title };
      },
      restoreTab: function ml_restoreTab(aTabmail, aPersistedState) {
        aTabmail.openTab("messageList", { id : aPersistedState.conversationId,
                                          title : aPersistedState.title,
                                          background: true });
      },
      supportsCommand: function ml_supportsCommand(aCommand, aTab) {
        return false;
      },
      isCommandEnabled: function ml_isCommandEnabled(aCommand, aTab) {
        return false;
      },
      doCommand: function ml_doCommand(aCommand, aTab) {
      },
      onEvent: function ml_onEvent(aEvent, aTab) {
      },
      getBrowser: function ml_getBrowser(aCommand, aTab) {
        return aTab.browser;
      },
    },

    // A tab for displaying your Gloda Contacts
    contacts: {
      type: "contacts",
      isDefault: false,
      contactsId : 0,

      openTab: function ml_openTab(aTab, aArgs) {
        let contact = aArgs.contact;
        aTab.contact = contact || null;
        aTab.title = (contact && contact.name)? contact.name : "Contacts";
        window.title = aTab.title;

        // Clone the browser for our new tab.
        aTab.browser = document.getElementById("browser").cloneNode(true);
        aTab.browser.setAttribute("id", "contacts"+this.contactsId);
        aTab.panel.appendChild(aTab.browser);
        aTab.browser.contentWindow.tab = aTab;
        aTab.browser.contentWindow.title = aArgs.title;
        aTab.browser.setAttribute("type", aArgs.background ? "content-targetable" :
                                                             "content-primary");
        aTab.browser.loadURI("chrome://hometab/content/contacts.html");
        this.contactsId++;
      },

      htmlLoadHandler: function ml_htmlLoadHandler(aContentWindow) {
        aContentWindow.tab.tabNode.setAttribute("loaded", true);
        hometab.showContactsInTab(aContentWindow);
      },

      showTab: function ml_showTab(aTab) {
        aTab.browser.setAttribute("type", "content-primary");
      },
      shouldSwitchTo: function onSwitchTo({contact: aContact}) {
        let tabInfo = document.getElementById("tabmail").tabInfo;

        for (let selectedIndex = 0; selectedIndex < tabInfo.length;
             ++selectedIndex) {
          if (tabInfo[selectedIndex].mode.name == this.modes.contacts.type &&
              tabInfo[selectedIndex].contact &&
              tabInfo[selectedIndex].contact == aContact) {
            return selectedIndex;
          }
        }
        return -1;
      },
      onTitleChanged: function ml_onTitleChanged(aTab) {
        window.title = aTab.title;
      },
      closeTab: function ml_closeTab(aTab) {
        aTab.browser.destroy();
      },
      saveTabState: function ml_saveTabState(aTab) {
        aTab.browser.setAttribute("type", "content-targetable");
      },
      persistTab: function ml_persistTab(aTab) {
        return { contactId: (aTab.contact)? aTab.contact.id : null };
      },
      restoreTab: function ml_restoreTab(aTabmail, aPersistedState) {
        let contact = aPersistedState.contactId;
        aTabmail.openTab("contacts", { contact : contact,
                                          background: true });
      },
      supportsCommand: function ml_supportsCommand(aCommand, aTab) {
        return false;
      },
      isCommandEnabled: function ml_isCommandEnabled(aCommand, aTab) {
        return false;
      },
      doCommand: function ml_doCommand(aCommand, aTab) {
      },
      onEvent: function ml_onEvent(aEvent, aTab) {
      },
      getBrowser: function ml_getBrowser(aCommand, aTab) {
        return aTab.browser;
      },
    },

    // A tab for displaying our hometab revision control messages
    source: {
      type: "source",
      isDefault: false,

      openTab: function ml_openTab(aTab, aArgs) {
        window.title = aTab.title = "Home Tab Source Control";

        // Clone the browser for our new tab.
        aTab.browser = document.getElementById("browser").cloneNode(true);
        aTab.browser.setAttribute("id", "source");
        aTab.panel.appendChild(aTab.browser);
        aTab.browser.contentWindow.tab = aTab;
        aTab.browser.contentWindow.title = aArgs.title;
        aTab.browser.setAttribute("type", aArgs.background ? "content-targetable" :
                                                             "content-primary");
        aTab.browser.loadURI("chrome://hometab/content/source.html");
        contentWindow.tab.tabNode.setAttribute("loaded", true);
      },

      showTab: function ml_showTab(aTab) {
        aTab.browser.setAttribute("type", "content-primary");
      },
      shouldSwitchTo: function onSwitchTo({contact: aContact}) {
        let tabInfo = document.getElementById("tabmail").tabInfo;

        for (let selectedIndex = 0; selectedIndex < tabInfo.length;
             ++selectedIndex) {
          // There can be only 1
          if (tabInfo[selectedIndex].mode.name == this.modes.source.type) {
            return selectedIndex;
          }
        }
        return -1;
      },
      onTitleChanged: function ml_onTitleChanged(aTab) {
        window.title = aTab.title;
      },
      closeTab: function ml_closeTab(aTab) {
        aTab.browser.destroy();
      },
      saveTabState: function ml_saveTabState(aTab) {
        aTab.browser.setAttribute("type", "content-targetable");
      },
      persistTab: function ml_persistTab(aTab) {
        return { };
      },
      restoreTab: function ml_restoreTab(aTabmail, aPersistedState) {
        aTabmail.openTab("source", { background: true });
      },
      supportsCommand: function ml_supportsCommand(aCommand, aTab) {
        return false;
      },
      isCommandEnabled: function ml_isCommandEnabled(aCommand, aTab) {
        return false;
      },
      doCommand: function ml_doCommand(aCommand, aTab) {
      },
      onEvent: function ml_onEvent(aEvent, aTab) {
      },
      getBrowser: function ml_getBrowser(aCommand, aTab) {
        return aTab.browser;
      },
    },
  },
};

function folderCollectionListener(aWin, aTab, aFolder) {
  this.aWin = aWin;
  this.tab = aTab;
  this.folder = aFolder;
  this.conversations = {};
  this.collection = null;
  this.queryCompleted = false;
}
folderCollectionListener.prototype = {
  // Return the unread count for conversations (which we've seen) in this folder
  unread: function fcl_unread() {
    return [conversation.read for each([,conversation] in
                                      Iterator(this.conversations))
                                      if (!conversation.read)
            ].length;
  },
  updateTitle: function fcl_updateTitle() {
    let unread = this.unread();
    let title = this.folder.prettyName + (unread > 0? " (" + unread + ")" : "");
    this.tab.browser.contentWindow.setHeaderTitle(title);
    this.tab.title = title;
    document.getElementById("tabmail").setTabTitle(this.tab);
    this.tab.tabNode.setAttribute("read", (unread <= 0));
  },
  onItemsAdded: function fcl_onItemsAdded(aItems, aCollection) {
    //Application.console.log("onItemsAdded,aItems: " + aItems);
    //Application.console.log("onItemsAdded,aCollection: " + aCollection.items);
    if (!this.queryCompleted)
      return;

    //let t2 = new Date();
    try {
      let conversations = [];
      for (var [,message] in Iterator(aItems)) {
        let id = message.conversationID;
        hometab._augmentMessage(message);
        if (!(id in this.conversations)) {
          this.conversations[id] = message.conversation;
          this.conversations[id].topic = message;
          this.conversations[id].last = message;
          this.conversations[id].read = message.read;
          this.conversations[id].match = message.conversation.subject;
          this.conversations[id].all = [];
          this.conversations[id].unread = [];
          this.conversations[id].attachments = (typeof message.attachmentTypes != "undefined" &&
                                                message.attachmentTypes.length > 0);
          this.conversations[id].starred = message.starred;
        }
        //This won't exactly give us a unique list if there are many items from
        // the same conversation.  It will just mean it's rendered more than once
        conversations.push(this.conversations[id]);

        let conversation = this.conversations[id];
        this.conversations[id].unread = this.conversations[id].all.filter(function(m) { return !m.read &&
                                                                                                m != conversation.topic; });
        this.conversations[id].unread.sort(function(a,b) { return a.date > b.date; });

        this.conversations[id].read = (this.conversations[id].unread.length <= 0 && this.conversations[id].topic.read)

        this.conversations[id].starred = this.conversations[id].all.some(function(m) { return m.starred; });

        // we're going to ignore if the person has removed attachments from
        // previous conversations, that's just lame
        if (!this.conversations[id].attachments)
          this.conversations[id].attachments = (typeof message.attachmentTypes != "undefined" &&
                                                message.attachmentTypes.length > 0)

        this.conversations[id].match += [person.contact.name for each([,person] in
                                                                      Iterator(message.involves))].join('');

        this.conversations[id].all.push(message);

        //This is rarely going to work out correctly as we're creating our
        // own conversation mapping over a subset of messages.  Only if the
        // actual topic is in the 50 message limit will this trick work
        if (message.date < this.conversations[id].topic.date) {
          let topic = this.conversations[id].topic;
          this.conversations[id].topic = message;
        }

        //Set the last message up so we can easily access that
        if (message.date > this.conversations[id].last.date) {
          this.conversations[id].last = message;
        }
      }

      this.aWin.updateConversations(conversations);
      this.updateTitle();

      //let t3 = new Date();
      //dump("Called showConversationsInFolder: "+(t1-t0)+"/"+(t2-t1)+"/"+(t3-t2)+"\n");
    } catch (e) {
      Application.console.log("\n\nCaught error in Conversations Query.  e="+e+"\n");
      Application.console.log(e.stack);

      dump("\n\nCaught error in Conversations Query.  e="+e+"\n");
      dump(e.stack);
      dump("\n");
    }
  },
  onItemsModified: function fcl_onItemsModified(aItems, aCollection) {

    if (!this.queryCompleted)
      return;

    //let t2 = new Date();
    try {
      let updatedConversations = [];
      for (var [,message] in Iterator(aItems)) {
        let id = message.conversationID;
        hometab._augmentMessage(message);
        if (!(id in this.conversations)) {
          Application.console.log("YIKES! we shouldn't be getting new conversations in onItemsModified");
        } else
          updatedConversations.push(this.conversations[id])

        let conversation = this.conversations[id];
        this.conversations[id].unread = this.conversations[id].all.filter(function(m) { return !m.read &&
                                                                                                m != conversation.topic; });
        this.conversations[id].unread.sort(function(a,b) { return a.date > b.date; });

        this.conversations[id].read = (this.conversations[id].unread.length <= 0 && this.conversations[id].topic.read)

        this.conversations[id].starred = this.conversations[id].all.some(function(m) { return m.starred; });

        // we're going to ignore if the person has removed attachments from
        // previous conversations, that's just lame
        if (!this.conversations[id].attachments)
          this.conversations[id].attachments = (typeof message.attachmentTypes != "undefined" &&
                                                message.attachmentTypes.length > 0)

        //This is rarely going to work out correctly as we're creating our
        // own conversation mapping over a subset of messages.  Only if the
        // actual topic is in the 50 message limit will this trick work
        if (message.date < this.conversations[id].topic.date) {
          let topic = this.conversations[id].topic;
          this.conversations[id].topic = message;
        }

        //Set the last message up so we can easily access that
        if (message.date > this.conversations[id].last.date) {
          this.conversations[id].last = message;
        }
      }

      this.aWin.updateConversations(updatedConversations);
      this.updateTitle();

      //let t3 = new Date();
      //dump("Called showConversationsInFolder: "+(t1-t0)+"/"+(t2-t1)+"/"+(t3-t2)+"\n");
    } catch (e) {
      Application.console.log("\n\nCaught error in Conversations Query.  e="+e+"\n");
      Application.console.log(e.stack);

      dump("\n\nCaught error in Conversations Query.  e="+e+"\n");
      dump(e.stack);
      dump("\n");
    }
  },
  onItemsRemoved: function fcl_onItemsRemoved(aItems, aCollection) {

    //let t2 = new Date();
    try {
      let removedConversations = [];
      let updatedConversations = [];
      for (var [,message] in Iterator(aItems)) {
        let id = message.conversationID;
        if (!(id in this.conversations)) {
          Application.console.log("YIKES! we shouldn't be getting empty conversations in onItemsRemoved");
        } else {
          // Remove the removed item (message) from our conversation container
          this.conversations[id].all = this.conversations[id].all.filter(function(m) { return m != message; });
          if (this.conversations[id].all.length <= 0)
            removedConversations.push(this.conversations[id])
          else
            updatedConversations.push(this.conversations[id])
        }

        // if the conversation was unread and this message was unread recalculate the conversation
        if (!this.conversations[id].read && !message.read) {
          let conversation = this.conversations[id];
          this.conversations[id].unread = this.conversations[id].all.filter(function(m) { return !m.read && m != conversation.topic; });
          this.conversations[id].unread.sort(function(a,b) { return a.date > b.date; });
          this.conversations[id].read = (this.conversations[id].unread.length <= 0 &&
                                         this.conversations[id].topic.read)
        }

        // If the conversation was starred or this message was starred recalculate it
        if (this.conversations[id].starred || message.starred)
          this.conversations[id].starred = this.conversations[id].all.some(function(m) { return m.starred; });

        // if this conversation had attachments and this message was one of them
        // we need to check if there are any attachments in the conversation at this point
        if (this.conversations[id].attachments && message.attachments.length > 0)
          this.conversations[id].attachments = this.conversations[id].all.some(function(m) { return m.attachments.length > 0; });

      }
      this.aWin.updateConversations(updatedConversations);
      this.aWin.removeConversations(removedConversations, this.conversations);
      this.updateTitle();

      //let t3 = new Date();
      //dump("Called showConversationsInFolder: "+(t1-t0)+"/"+(t2-t1)+"/"+(t3-t2)+"\n");
    } catch (e) {
      Application.console.log("\n\nCaught error in Conversations Query.  e="+e+"\n");
      Application.console.log(e.stack);

      dump("\n\nCaught error in Conversations Query.  e="+e+"\n");
      dump(e.stack);
      dump("\n");
    }

  },
  onQueryCompleted: function fcl_onQueryCompleted(aCollection) {
    // Turns out if you don't hold onto this collection then Gloda won't give you
    // further events about the items in the query
    this.collection = aCollection;
    //let t2 = new Date();
    try {
      let conversations = [];
      for (var [,message] in Iterator(aCollection.items)) {
        let id = message.conversationID;
        hometab._augmentMessage(message);
        if (!(id in this.conversations)) {
          this.conversations[id] = message.conversation;
          this.conversations[id].topic = message;
          this.conversations[id].last = message;
          this.conversations[id].read = message.read;
          this.conversations[id].match = message.conversation.subject;
          this.conversations[id].all = [];
          this.conversations[id].unread = [];
          this.conversations[id].attachments = (message.attachments.length > 0);
          this.conversations[id].starred = message.starred;
          conversations.push(this.conversations[id]);
        }
        // only the unread messages
        if (! message.read ) {
          this.conversations[id].unread.push(message);
        }

        if (!this.conversations[id].starred)
          this.conversations[id].starred = message.starred;

        if (!this.conversations[id].attachments)
          this.conversations[id].attachments = (message.attachments.length > 0);

        this.conversations[id].match += [person.contact.name for each([,person] in
                                                                      Iterator(message.involves))].join('');

        this.conversations[id].all.push(message);

        //This is rarely going to work out correctly as we're creating our
        // own conversation mapping over a subset of messages.  Only if the
        // actual topic is in the 50 message limit will this trick work
        if (message.date < this.conversations[id].topic.date) {
          this.conversations[id].topic = message;
        }

        //Set the last message up so we can easily access that
        if (message.date > this.conversations[id].last.date) {
          this.conversations[id].last = message;
        }
      }

      for each(let [i,conversation] in Iterator(this.conversations)) {
        //Mark the conversation read or not
        conversation.read = (conversation.unread.length <= 0);

        //Go through the unread and pull the topic message out
        for each(let [i,msg] in Iterator(conversation.unread)) {
          if (msg == conversation.topic) {
            conversation.unread.splice(i,1);
            break;
          }
        }

        //Sort the unread list
        conversation.unread.sort(function(a,b) { return a.date > b.date; });
      }

      //Let this listener begin working on new onItemsAdded calls
      //XXX we might lose some items if there was a call while we were processing
      this.queryCompleted = true;

      this.aWin.addContent(conversations);
      this.updateTitle();

      //let t3 = new Date();
      //dump("Called showConversationsInFolder: "+(t1-t0)+"/"+(t2-t1)+"/"+(t3-t2)+"\n");
    } catch (e) {
      Application.console.log("\n\nCaught error in Conversations Query.  e="+e+"\n");
      Application.console.log(e.stack);

      dump("\n\nCaught error in Conversations Query.  e="+e+"\n");
      dump(e.stack);
      dump("\n");
    }
  }
}

function getFolderNameAndCount(aFolder) {
  let unread = aFolder.getNumUnread(false);
  return aFolder.prettyName + (unread > 0? " (" + unread + ")" : "");
}

function UpdateMailToolbar() {
  // Stub this out so that tabmail.xml is happy.
}

function SetBusyCursor() {
  // Stub this out so that tabmail.xml is happy.
}

var statusFeedback = {
  showProgress: function sf_showProgress(aProgress) {
    // Stub this out so that tabmail.xml is happy.
  },
}

function sortFolderByNameFunc(a,b) {

  let rv = 0;
  if (/^Inbox/.test(a.name)) rv -= 1;
  if (/^Inbox/.test(b.name)) rv += 1;
  if (rv) return rv;

  if (/^Starred/.test(a.name)) rv -= 1;
  if (/^Starred/.test(b.name)) rv += 1;
  if (rv) return rv;

  if (/^Drafts/.test(a.name)) rv -= 1;
  if (/^Drafts/.test(b.name)) rv += 1;
  if (rv) return rv;

  if (/^Sent/.test(a.name)) rv -= 1;
  if (/^Sent/.test(b.name)) rv += 1;
  if (rv) return rv;

  if (/^Spam/.test(a.name)) rv -= 1;
  if (/^Spam/.test(b.name)) rv += 1;
  if (rv) return rv;

  if (/^Trash/.test(a.name)) rv -= 1;
  if (/^Trash/.test(b.name)) rv += 1;
  if (rv) return rv;

  if (a.name < b.name) return -1;
  return 1;
}

function sortFolderItems(map) {
  map.sort(sortFolderByNameFunc);
  return map;
}

/**
 * From mail/base/content/mailWindowOverlay.js.
 */
function CreateToolbarTooltip(document, event)
{
  event.stopPropagation();
  var tn = document.tooltipNode;
  if (tn.localName != "tab")
    return false; // Not a tab, so cancel the tooltip.
  if ("mOverCloseButton" in tn && tn.mOverCloseButton) {
     event.target.setAttribute("label", tn.getAttribute("closetabtext"));
     return true;
  }
  if (tn.hasAttribute("label")) {
    event.target.setAttribute("label", tn.getAttribute("label"));
    return true;
  }
  return false;
}

var gStatusBar = document.getElementById("statusbar-icon");

var tabmail = document.getElementById("tabmail");
tabmail.registerTabType(homeTabType);
tabmail.registerTabType(contentTabType);
tabmail.openFirstTab("home", {});

// Give the XBL a change to build the anonymous elements before we ask for them.
window.setTimeout(function() {
  tabmail.tabContainer.orient = "vertical";
  tabmail.tabContainer.mTabstrip.orient = "vertical";
  document.getAnonymousElementByAttribute(tabmail, "anonid", "tabbox")
          .orient = "horizontal";
  //Make the tabs a little wider by default
  tabmail.tabContainer.childNodes[0].minWidth = 240;
}, 0);

var gAccelDown = false;

function doKeyPress(event) {
  try {
    if (! event.metaKey) return;
    let charString = String.fromCharCode(event.charCode);
    let counter = 1;
    for (let i = 0; i < tabmail.tabContainer.childNodes.length; i++) {
      let tabinfo = tabmail.tabInfo[i];
      if (tabinfo.mode.type == 'home' || tabinfo.mode.type == 'folderList') {
        if (charString == counter.toString()) {
          tabmail.selectTabByIndex(event, i);
          return;
        }
        counter++;
      }
      if (counter == 10) break;
    }
  } catch (e) { logException(e); }
}

var gKeyDownTimeout = null;

function doKeyDown(event) {
  // to avoid flashing on common sequences
  if (event.keyCode == 224) {
    gKeyDownTimeout = window.setTimeout(function() {
      doShortcuts(true);
    }, 250); // don't show them immediately
  }
}

function doShortcuts(show) {
  try {
    if (!show && !gAccelDown) return;
    let counter = 1;

    window.clearTimeout(gKeyDownTimeout);
    gKeyDownTimeout = null;
    for (let i = 0; i < tabmail.tabContainer.childNodes.length; i++) {
      let tabinfo = tabmail.tabInfo[i];
      if (tabinfo.mode.type == 'home' || tabinfo.mode.type == 'folderList') {
        if (show) {
          tabinfo.prevTitle = tabinfo.title;
          tabinfo.title = counter.toString() + ": " + tabinfo.title;
        } else {
          tabinfo.title = tabinfo.prevTitle || tabinfo.title;
        }
        tabmail.setTabTitle(tabinfo)
        counter++;
      }
      if (counter == 10) break;
    }
    gAccelDown = show;
    if (show) {
      // Sometimes, for reasons unknown, we don't get blur events on application
      // switching, which results in shortcuts staying around after the meta key
      // is up (but in a different app).  This is a hack that gets around the
      // problem.
      window.setTimeout(function() { doShortcuts(false);}, 2000);
    }
  } catch (e) {
    logException(e);
  }
}

function doKeyUp(event) {
  try {
    if (gKeyDownTimeout) {
      window.clearTimeout(gKeyDownTimeout);
      gKeyDownTimeout = null;
      return;
    }
    if (event.keyCode == 224)
      doShortcuts(false);
    gKeyDownTimeout = null;
  } catch (e) {
    logException(e);
  }
}

// we should also do a doShortcuts(false) whenever a new tab gets created.

function onBlur(event) {
  doShortcuts(false);
}

//This saves the current session and stops the session manager service
function saveSession() {
  let tabmail = document.getElementById('tabmail');
  let tabsState = tabmail.persistTabs();
  if (tabsState)
    hometabSessionManager.unloadingWindow(tabsState);
}

//This restores the session and starts a new session manager service
function restoreSession() {
  let tabsState = hometabSessionManager.loadingWindow();
  let dontRestoreFirstTab = false;
  if (tabsState)
    document.getElementById("tabmail").restoreTabs(tabsState.tabs, dontRestoreFirstTab);
}

function openSubTab(aType, aArgs) {
  let tabmail = document.getElementById("tabmail");
  let tabInfo = tabmail.tabInfo;
  let tabContainer = tabmail.tabContainer;
  let index = tabInfo.indexOf(tabmail.currentTabInfo);
  tabmail.openTab(aType, aArgs);
  // Move the new tab into position, if it's not already the last child.
  if (index != tabContainer.children.length - 1) {
    let last = tabInfo.pop();
    tabInfo.splice(index+1, 0, last);
    last = tabContainer.lastElementChild;
    tabContainer.removeChild(last);
    tabContainer.insertBefore(last, tabContainer.children[index+1]);
  }
}

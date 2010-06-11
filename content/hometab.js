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
Cu.import("resource://app/modules/MailUtils.js");
Cu.import("resource://app/modules/errUtils.js");
Cu.import("resource:///modules/iteratorUtils.jsm");

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
    const outFolderFlagMask = nsMsgFolderFlags.SentMail |
                              nsMsgFolderFlags.Drafts |
                              nsMsgFolderFlags.Queue |
                              nsMsgFolderFlags.Templates |
                              nsMsgFolderFlags.Newsgroup;

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

  showConversations: function show_Conversations(doc, id, title) {
    let tabmail = document.getElementById("tabmail");
    tabmail.openTab("folderList", {
      id: id,
      title: title,
    });
  },

  showConversationsInFolder: function show_ConversationsInFolder(aWin, aFolder) {
    //let t0 = new Date();
    aWin.setHeaderTitle(aWin.title);
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);

    if (aFolder.flags & nsMsgFolderFlags.Virtual) {
      let vFolder = new VirtualFolderHelper.wrapVirtualFolder(aFolder)
      query.folder.apply(query, vFolder.searchFolders);
    }
    else {
      query.folder(aFolder);
    }
    query.orderBy("-date");
    query.limit(50);
    //let t1 = new Date();
    query.getCollection({
      onItemsAdded: function _onItemsAdded(aItems, aCollection) {
      },
      onItemsModified: function _onItemsModified(aItems, aCollection) {
      },
      onItemsRemoved: function _onItemsRemoved(aItems, aCollection) {
      },
      /* called when our database query completes */
      onQueryCompleted: function _onQueryCompleted(messages) {
        //let t2 = new Date();
        try {
          let conversations = [];
          let seenConversations = {};
          for (var [,message] in Iterator(messages.items)) {
            let id = message.conversationID;
            if (!(id in seenConversations)) {
              seenConversations[id] = {
                  "id" : id,
                  "topic" : message,
                  "read" : [],
                  "unread" : []
                  };
            }
            if (! message.read)
              seenConversations[id].unread.push(message);
            else
              seenConversations[id].read.push(message);

            //This is rarely going to work out correctly as we're creating our
            // own conversation mapping over a subset of messages.  Only if the
            // actual topic is in the 50 message limit will this trick work
            if (message.date < seenConversations[id].topic.date) {
              seenConversations[id].topic = message;
            }

          }
          for (var id in seenConversations) {
            let conversation = seenConversations[id];

            //Count unread before we possible remove the topic from the list
            let unread = conversation.unread.length;

            // Remove the topic message from the messages list
            for each(let [i,message] in Iterator(conversation.unread))
              if (message.id == conversation.topic.id) {
                conversation.unread.splice(i,1);
                break;
              }

            //We need these unread messages sorted opposite the conversations; oldest first
            conversation.messages = [].concat(conversation.unread.splice(0,3))
                                      .sort(function(a,b) { return a.date > b.date; });

            conversation.read = (unread <= 0);
            delete conversation.unread;
            conversations.push(conversation);
          }
          aWin.addContent(conversations);
          //let t3 = new Date();
          //dump("Called showConversationsInFolder: "+(t1-t0)+"/"+(t2-t1)+"/"+(t3-t2)+"\n");
        } catch (e) {
          Application.console.log("\n\nCaught error in Conversations Query.  e="+e+"\n");
          Application.console.log(e.stack);

          dump("\n\nCaught error in Conversations Query.  e="+e+"\n");
          dump(e.stack);
          dump("\n");
        }
      }});
  },

  showMessages: function showMessages(doc, id, subject, read) {
    let tabmail = document.getElementById("tabmail");
    // The following call fails because glodaList isn't a recognized
    // tab mode for some reason.
    tabmail.openTab("messageList", {
      id: id,
      title: subject,
      read : read
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

  addMessages: function addMessages(aWin, aMessages) {
    aWin.addMessages(aMessages);
    for (var i in aMessages) {
      this.populateMessageBody(aWin, aMessages[i]);
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
        for each(var [,message] in Iterator(items))
          aWin.tab.results.push(message);
        self.addMessages(aWin, aWin.tab.results);
        aWin.setHeaderTitle(aWin.tab.title);
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
        aTab.title = aArgs.title;
        aTab.id = "Home";
        window.title = aTab.title;
      },

      htmlLoadHandler: function ht_htmlLoadHandler(doc) {
        hometab.showFolders(doc);
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

      openTab: function fl_openTab(aTab, aArgs) {
        let folder = MailUtils.getFolderForURI(aArgs.id, true);
        aTab.title = aArgs.title;
        aTab.id = aArgs.id;
        window.title = aTab.title;

        // Clone the browser for our new tab.
        aTab.browser = document.getElementById("browser").cloneNode(true);
        aTab.browser.setAttribute("id", "folderList"+aTab.id);
        aTab.panel.appendChild(aTab.browser);
        aTab.browser.contentWindow.tab = aTab;
        aTab.browser.contentWindow.title = aArgs.title;
        aTab.browser.loadURI("chrome://hometab/content/folderView.html");
      },

      htmlLoadHandler: function ml_htmlLoadHandler(contentWindow) {
        let folder = MailUtils.getFolderForURI(contentWindow.tab.id, true);
        hometab.showConversationsInFolder(contentWindow, folder);
      },

      showTab: function fl_showTab(aTab) {
        window.title = aTab.title;
      },
      shouldSwitchTo: function onSwitchTo({id: aFolder}) {
        let tabInfo = document.getElementById("tabmail").tabInfo;

        for (let selectedIndex = 0; selectedIndex < tabInfo.length;
             ++selectedIndex) {
          if (tabInfo[selectedIndex].type == this.type &&
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
      },
      saveTabState: function fl_saveTabState(aTab) {
      },
      persistTab: function fl_persistTab(aTab) {
      },
      restoreTab: function fl_restoreTab(aTabmail, aPersistedState) {
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
        aTab.browser.loadURI("chrome://hometab/content/conversationView.html");
      },

      htmlLoadHandler: function ml_htmlLoadHandler(contentWindow) {
        hometab.showMessagesInConversation(contentWindow);
      },

      showTab: function ml_showTab(aTab) {
        window.title = aTab.title;
      },

      onTitleChanged: function ml_onTitleChanged(aTab) {
        window.title = aTab.title;
      },
      closeTab: function ml_closeTab(aTab) {
      },
      saveTabState: function ml_saveTabState(aTab) {
      },
      persistTab: function ml_persistTab(aTab) {
      },
      restoreTab: function ml_restoreTab(aTabmail, aPersistedState) {
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
tabmail.openFirstTab("home", {});

// Give the XBL a change to build the anonymous elements before we ask for them.
window.setTimeout(function() {
  tabmail.tabContainer.orient = "vertical";
  tabmail.tabContainer.mTabstrip.orient = "vertical";
  document.getAnonymousElementByAttribute(tabmail, "anonid", "tabbox")
          .orient = "horizontal";
  //Make the tabs a little wider by default
  tabmail.tabContainer.childNodes[0].minWidth = 150;
}, 0);

var gAccelDown = false;

function doKeyPress(event) {
  try {
    if (! event.metaKey) return;
    let charString = String.fromCharCode(event.charCode);
    counter = 1;
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

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

Components.utils.import("resource://app/modules/virtualFolderWrapper.js");

// -- Import modules we need.
Components.utils.import("resource://app/modules/gloda/public.js");
Components.utils.import("resource://app/modules/MailUtils.js");
Components.utils.import("resource://app/modules/errUtils.js");

var hometab = {

  _modes: {"Unread": function ht_unread() {
            let map = [];
            let currentFolder = gFolderTreeView.getSelectedFolders()[0];
            const outFolderFlagMask = nsMsgFolderFlags.SentMail |
              nsMsgFolderFlags.Drafts | nsMsgFolderFlags.Queue |
              nsMsgFolderFlags.Templates;
            for each (let folder in gFolderTreeView._enumerateFolders) {
              if (!folder.isSpecialFolder(outFolderFlagMask, true) &&
                  (!folder.isServer && folder.getNumUnread(false) > 0) ||
                  (folder == currentFolder))
                map.push({name: folder.abbreviatedName,
                          unread: folder.getNumUnread(false),
                          id: folder.URI});
            }
            //sortFolderItems(map);
            return map;
          },
          "Tags": null,
          "Folders": null,
          "People": null,
          "Accounts": null,
         },

  htmlLoadHandler: function htmlLoadHandler(doc) {
    let content = [];
    for (let mode in this._modes) {
      content.push({folder : mode,
                    id : mode,
                   });
    }
    doc.addCategories(content);
  },

  showFolders: function showFolders(doc, id) {
    let content = [];
    let func = this._modes[id] || function ht_null() { return []; };
    let folders = func();
    for (let index in folders) {
      let folder = folders[index];
      content.push({name : folder.name,
                    unread: folder.unread,
                    id : folder.id
                   });
    }
    doc.setFolders(content);
  },

  showConversations: function showConversations(doc, id) {
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    let folder = MailUtils.getFolderForURI(id, true);

    if (folder.flags & nsMsgFolderFlags.Virtual) {
      let vFolder = new VirtualFolderHelper.wrapVirtualFolder(folder)
      query.folder.apply(query, vFolder.searchFolders);
    }
    else {
      query.folder(folder);
    }
    query.orderBy("-date");
    query.limit(100);
    query.getCollection({
      onItemsAdded: function _onItemsAdded(aItems, aCollection) {
        dump("onItemsAdded:\n");
      },
      onItemsModified: function _onItemsModified(aItems, aCollection) {
      },
      onItemsRemoved: function _onItemsRemoved(aItems, aCollection) {
      },
      /* called when our database query completes */
      onQueryCompleted: function _onQueryCompleted(messages) {
        dump("onQueryCompleted\n");
        doc.clearContent();
        try {
          seenConversations = {};
          for (var i in messages.items) {
            message = messages.items[i];
            let id = message.conversationID;
            if (id in seenConversations) {
              seenConversations[id].messages.push(message);
            }
            else {
              seenConversations[id] = {
                  "id" : id,
                  "subject" : message.subject,
                  "messages" : [message],
                  "unread" : []
                  };
            }
            if (! message.read)
              seenConversations[id].unread.push(message);
          }
          for (var id in seenConversations) {
            doc.addContent(seenConversations[id]);
          }
        } catch (e) {
          dump("Caught error in Conversations Query.  e="+e+"\n");
          doc.addContent({"error":e});
        }
      }});
  },

  showMessages: function showMessages(doc, id) {
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    query.conversation(id)
    dump("Asking for conversation for "+id+"\n");
    query.orderBy("date");
    query.limit(1);
    query.getCollection({
      onItemsAdded: function _onItemsAdded(aItems, aCollection) {
        dump("onItemsAdded:\n");
      },
      onItemsModified: function _onItemsModified(aItems, aCollection) {
      },
      onItemsRemoved: function _onItemsRemoved(aItems, aCollection) {
      },
      /* called when our database query completes */
      onQueryCompleted: function _onQueryCompleted(messages) {
        dump("onQueryCompleted\n");
        try {
          message = messages.items[0];
          let tabmail = document.getElementById("tabmail");
          dump("currentTabInfo="+tabmail.currentTabInfo+"\n");
          // The following call fails because glodaList isn't a recognized
          // tab mode for some reason.
          tabmail.openTab("messageList", {
            conversation: message.conversation,
            message: message,
            title: message.conversation.subject,
          });
        } catch (e) {
          dump("Caught error in Messages Query.  e="+e+"\n");
        }
      }});
  },
};

var homeTabType = {
  // TabType attributes
  name: "HomeTab",
  panelId: "mailContent",
  modes: {
    // "home" tab type.
    home: {
      type: "home",
      isDefault: true,
      openFirstTab: function ht_openTab(aTab, aArgs) {
        dump("Args="+aArgs+"\n");
        aTab.title = "HomeTab";
        aTab.image = "chrome://hometab/content/hometab.png";
      },
      openTab: function ht_openTab(aTab, aArgs) {
      },
      closeTab: function ht_closeTab(aTab) {
      },
      saveTabState: function ht_saveTabState(aTab) {
      },
      showTab: function ht_showTab(aTab) {
        dump("Setting window.title to "+aTab.title+"\n");
        window.title = aTab.title;
      },
      persistTab: function ht_persistTab(aTab) {
      },
      restoreTab: function ht_restoreTab(aTabmail, aPersistedState) {
      },
      onTitleChanged: function ht_onTitleChanged(aTab) {
        dump("Setting 2 window.title to "+aTab.title+"\n");
        window.title = aTab.title;
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

    // "messageList" tab type.
    messageList: {
      type: "messageList",
      isDefault: false,
      openTab: function ml_openTab(aTab, aArgs) {
        dump("aArgs="+aArgs+"\n");
        for (let x in aArgs)
          dump("  ."+x+"\n");
        dump("aTab="+aTab+"\n");
        for (let x in aTab)
          dump("  ."+x+"\n");
        aTab.title = aArgs.title;
        let browser = document.getElementById("browser");
        browser.src = "chrome://hometab/content/conversationView.xhtml";
      },
      closeTab: function ml_closeTab(aTab) {
      },
      saveTabState: function ml_saveTabState(aTab) {
      },
      showTab: function ml_showTab(aTab) {
        dump("Setting window.title to "+aTab.title+"\n");
        window.title = aTab.title;
      },
      persistTab: function ml_persistTab(aTab) {
      },
      restoreTab: function ml_restoreTab(aTabmail, aPersistedState) {
      },
      onTitleChanged: function ml_onTitleChanged(aTab) {
        dump("Setting 2 window.title to "+aTab.title+"\n");
        window.title = aTab.title;
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
        return null;
      },
    },
  },
};

function UpdateMailToolbar() {
  // Stub this out so that tabmail.xml is happy.
  dump("Updating Mail Toolbar.  Not.\n");
}

function SetBusyCursor() {
  // Stub this out so that tabmail.xml is happy.
  dump("Setting Busy Cursor.  Not.\n");
}


statusFeedback = {
  showProgress: function sf_showProgress(aProgress) {
    // Stub this out so that tabmail.xml is happy.
    dump("statusFeedback.showProgress("+aProgress+").  Not.\n");
  },
}

var gStatusBar = document.getElementById("statusbar-icon");

var tabmail = document.getElementById("tabmail");
tabmail.registerTabType(homeTabType);
tabmail.openFirstTab("home", {});

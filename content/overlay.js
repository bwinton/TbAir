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

Components.utils.import("resource://app/modules/StringBundle.js");
Components.utils.import("resource://app/modules/virtualFolderWrapper.js");

// -- Import modules we need.
Components.utils.import("resource://app/modules/gloda/public.js");
Components.utils.import("resource://app/modules/MailUtils.js");

var hometab = {
  onMenuItemCommand: function(e) {
    let windowWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"]
                          .getService(Ci.nsIWindowWatcher);
    let messageURI = Cc["@mozilla.org/supports-string;1"]
                       .createInstance(Ci.nsISupportsString);

    let strings = new StringBundle("chrome://hometab/locale/hometab.properties");
    let window = windowWatcher.openWindow(null,
        "chrome://hometab/content/hometab.xul", strings.get("hometab.title"),
        "all,chrome,dialog=no,status,toolbar=no,resizable,width=1024,height=527",
        null);
    window.hometab = this;
    window.gFolderTreeView = gFolderTreeView;
    window.msgBundle = document.getElementById("bundle_messenger");
    window.nsMsgFolderFlags = Components.interfaces.nsMsgFolderFlags;
    window.tabmail = document.getElementById("tabmail");
  },

  htmlLoadHandler: function htmlLoadHandler(doc) {
    let content = [];
    // Handle TB 3.0, which uses _mapGenerators,
    // and 3.1 which uses _modes.
    let modes = gFolderTreeView._mapGenerators ?
      gFolderTreeView._mapGenerators :
      gFolderTreeView._modes;
    for (let mode in modes) {
      let displayName;
      if (mode in gFolderTreeView._modeDisplayNames) {
        displayName = gFolderTreeView._modeDisplayNames[mode];
      }
      else {
        let key = "folderPaneHeader_" + mode;
        displayName = msgBundle.getString(key);
      }
      content.push({folder : displayName,
                    id : mode
                   });
    }
    doc.addCategories(content);
  },

  showFolders: function showFolders(doc, id) {
    let content = [];
    let folders = gFolderTreeView._mapGenerators ?
      gFolderTreeView._mapGenerators[id](gFolderTreeView) :
      gFolderTreeView._modes[id].generateMap(gFolderTreeView);
    for (let index in folders) {
      let folder = folders[index];
      content.push({name : folder._folder.abbreviatedName,
                    unread: folder._folder.getNumUnread(false),
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
          dump("e="+e+"\n");
          doc.addContent({"error":e});
        }
      }});
  },

  showMessages: function showMessages(doc, id) {
    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
    query.conversation(id)
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
          tabmail.openTab("glodaList", {
            conversation: message.conversation,
            message: message,
            title: message.conversation.subject,
            background: false
          });
        } catch (e) {
          dump("e="+e+"\n");
        }
      }});
  },
}

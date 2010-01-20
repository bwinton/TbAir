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
 * Blake Winton.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

const Cu = Components.utils;

Cu.import("resource://app/modules/StringBundle.js");
Cu.import("resource://app/modules/virtualFolderWrapper.js");


var hometab = {
  onLoad: function hometab_onLoad(e) {
    // initialization code
    let tabmail = document.getElementById('tabmail');
    if (tabmail)
      tabmail.registerTabType(homeTabType);
  },

  onMenuItemCommand: function(e) {
    let tabmail = document.getElementById("tabmail");
    home = tabmail.openTab("hometab", {"a":"b"});
    home.tabNode.image = "chrome://hometab/content/home.png";
  }
}

var homeTabType = {
  name: "hometab",
  perTabPanel: "iframe",
  strings: new StringBundle("chrome://hometab/locale/hometab.properties"),
  modes: {
    hometab: {
      // this is what get exposed on the tab for icon purposes
      type: "hometab"
    }
  },

  openTab: function homeTabType_openTab(aTab, aArgs) {
    // we have no browser until our XUL document loads
    aTab.browser = null;

    aTab.title = this.strings.get("hometab.title");

    aTab.htmlLoadHandler = function htmlLoadHandler(doc) {
      let content = [];
      // Handle TB 3.0, which uses _mapGenerators,
      // and 3.1 which uses _modes.
      let folders = gFolderTreeView._mapGenerators ?
        gFolderTreeView._mapGenerators["smart"](gFolderTreeView) :
        gFolderTreeView._modes["smart"].generateMap(gFolderTreeView);
      // Used to be _modes["unread"].
      for (let index in folders) {
        let folder = folders[index];
        content.push({folder : folder.text,
                      id : folder.id
                     });
      }
      doc.addCategories(content);
    }

    aTab.showConversations = function showConversations(doc, id) {
      let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
      let folder = MailUtils.getFolderForURI(id, true);
      let vFolder = new VirtualFolderHelper.wrapVirtualFolder(folder)
      query.folder.apply(query, vFolder.searchFolders);
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
              if (message.conversation.id in seenConversations) {
                seenConversations[message.conversation.id].push(message.id);
              }
              else {
                seenConversations[message.conversation.id] = [message.subject,
                                                              message.id];
              }
            }
            for (var id in seenConversations) {
              let count = seenConversations[id].length - 1;
              doc.addContent({"subject" : seenConversations[id][0],
                              "count" : count,
                              "id" : id});
            }
          } catch (e) {
            dump("e="+e+"\n");
            doc.addContent({"error":e});
          }
        }});
    }

    aTab.showMessages = function showMessages(doc, id) {
      let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
      query.conversation(id)
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
            for (var i in messages.items) {
              message = messages.items[i];
              doc.addContent({"subject" : message.subject,
                              "id" : message.id,
                              "date" : message.date,
                              "from" : message.from.value,
                              "to" : message.to.map(
                                function (x) {return x.value;}).join(", ")
                              });
            }
          } catch (e) {
            dump("e="+e+"\n");
            doc.addContent({"error":e});
          }
        }});
    }

    function xulLoadHandler() {
      aTab.panel.contentWindow.removeEventListener("load", xulLoadHandler,
                                                   false);
      aTab.panel.contentWindow.tab = aTab;
      aTab.browser = aTab.panel.contentDocument.getElementById("browser");
      aTab.browser.setAttribute("src",
        "chrome://hometab/content/hometab.xhtml");
    }

    aTab.panel.contentWindow.addEventListener("load", xulLoadHandler, false);
    aTab.panel.setAttribute("src", "chrome://hometab/content/hometab.xul");
  },
  closeTab: function homeTabType_closeTab(aTab) {
  },
  saveTabState: function homeTabType_saveTabState(aTab) {
    // nothing to do; we are not multiplexed
  },
  showTab: function homeTabType_showTab(aTab) {
    // nothing to do; we are not multiplexed
  },
  getBrowser: function(aTab) {
    return aTab.browser;
  }
}

window.addEventListener("load",
                        function(e) { hometab.onLoad(e); },
                        false);

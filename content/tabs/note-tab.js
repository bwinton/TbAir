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
 * The Mozilla Foundation.
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

const EXPORTED_SYMBOLS = ["note"];

var window;

// A tab for displaying our hometab revision control messages
var note = {
  type: "note",
  isDefault: false,

  init: function sr_init(aHomeTabType, aWindow) {
    window = aWindow;
    aHomeTabType.modes.note = note;
  },

  openTab: function sr_openTab(aTab, aArgs) {
    window.title = aTab.title = "Notes";

    // Clone the browser for our new tab.
    aTab.browser = window.document.getElementById("browser").cloneNode(true);
    aTab.browser.setAttribute("id", "note");
    aTab.panel.appendChild(aTab.browser);
    aTab.browser.contentWindow.tab = aTab;
    aTab.browser.contentWindow.title = aArgs.title;
    aTab.browser.setAttribute("type", aArgs.background ? "content-targetable" :
                                                         "content-primary");
    aTab.browser.loadURI("chrome://hometab/content/tabs/note.html");
  },

  htmlLoadHandler: function dc_htmlLoadHandler(aContentWindow) {
    aContentWindow.tab.tabNode.setAttribute("loaded", true);
  },

  showTab: function sr_showTab(aTab) {
    aTab.browser.setAttribute("type", "content-primary");
  },
  shouldSwitchTo: function sr_onSwitchTo() {
    let tabInfo = window.document.getElementById("tabmail").tabInfo;

    for (let selectedIndex = 0; selectedIndex < tabInfo.length;
         ++selectedIndex) {
      // There can be only 1
      if (tabInfo[selectedIndex].mode.name == this.modes.note.type) {
        return selectedIndex;
      }
    }
    return -1;
  },
  onTitleChanged: function sr_onTitleChanged(aTab) {
    window.title = aTab.title;
  },
  closeTab: function sr_closeTab(aTab) {
    aTab.browser.destroy();
  },
  saveTabState: function sr_saveTabState(aTab) {
    aTab.browser.setAttribute("type", "content-targetable");
  },
  persistTab: function sr_persistTab(aTab) {
    return { };
  },
  restoreTab: function sr_restoreTab(aTabmail, aPersistedState) {
    aTabmail.openTab("note", { background: true });
  },
  supportsCommand: function sr_supportsCommand(aCommand, aTab) {
    return false;
  },
  isCommandEnabled: function sr_isCommandEnabled(aCommand, aTab) {
    return false;
  },
  doCommand: function sr_doCommand(aCommand, aTab) {
  },
  onEvent: function sr_onEvent(aEvent, aTab) {
  },
  getBrowser: function sr_getBrowser(aCommand, aTab) {
    return aTab.browser;
  },
};

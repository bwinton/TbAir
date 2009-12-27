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

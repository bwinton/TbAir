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

/* :::::::: Constants and Helpers ::::::::::::::: */

const EXPORTED_SYMBOLS = ["source"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var $;

var source = {
  init: function initialize(jQuery, hometab) {
    $ = jQuery;
    $("<li class='menuSource'>recent commits</li>").appendTo(".features")
      .click( function showSource(event) {
        // XXX: The metaKey is mac only we need an if (!mac) event.ctrlKey case
        // XXX: The middle button is not being detected correctly right now
        let background = event.metaKey || (event.button == 1);
        hometab.tabmail.openTab("source", { background: background });
      });
  },

  filterSource: function filterSource(event) {
    try {
      let filterNode = $(event.target);
      var filter = filterNode.val(), count = 0;
      $(".column.left").each(function () {
        let matchString = $(this).children(".from").text() +
                          $(this).next().find(".body").text();
        if ((filter.length == 0) ||
            (matchString.search(new RegExp(filter, "i")) < 0))
          $(this).closest(".conversation").hide();
        else
          $(this).closest(".conversation").show();
      });
      if (event.keyCode == event.DOM_VK_RETURN) {
        let items = $(".column .topic:visible");
        if (items.length == 1) {
          items.find(".body").trigger("click");
        }
      }
    } catch (e) {
      logException(e);
    }
  }
}

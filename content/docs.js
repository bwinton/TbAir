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
 * The Original Code is HomeTab.
 *
 * The Initial Developer of the Original Code is
 * The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
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

var docs = {
  maxSize: 1024*1024,
  apiKey: "4aq7xz93k96omkn0t6c0q05bfan4igtv",
  baseUrl: "https://www.box.net/api/1.0/rest",
  authkeyPref: "extensions.hometab.authkey",

  onLoad: function dc_onLoad() {
    // initialization code
    this.initialized = true;
    $().ajaxError(function(event, request, options, e) {
      dump("HT: Error requesting page " + options.url + ":" + e + "\n");
    });

    this.pref = Cc["@mozilla.org/preferences-service;1"]
                  .getService(Ci.nsIPrefBranch);

    if (!this.pref.prefHasUserValue(this.authkeyPref)) {
      this.getAuthKey();
    }
    else {
      this.authkey = this.pref.getCharPref(this.authkeyPref);
      this.populateDocumentList();
    }
  },

  populateDocumentList: function dc_populateDocumentList() {
    this.callApi("get_account_tree", {folder_id: 0, "params[]": "nozip"},
      function onSuccess(aResponse) {
        if (aResponse.children("status").text() == "listing_ok") {
          let objs = aResponse.find("file");
          let files = [];
          objs.each(function(i, obj) {
            let file = $(obj);
            files.push({
              id: file.attr("id"),
              name: file.attr("file_name"),
              size: file.attr("size"),
              created: file.attr("created"),
              updated: file.attr("updated"),
              thumbnail: file.attr("large_thumbnail"),
              preview: file.attr("preview_thumbnail")
            });
          });
          $("#docstmpl").render(files).appendTo($("ol.docs"));
        }
      });
  },

  /**
   * Start the long and involved process of getting an auth key.
   */
  getAuthKey: function dc_getAuthKey() {
    var authRequest = new XMLHttpRequest();
    authRequest.open("GET",
      "https://www.box.net/api/1.0/rest?action=get_ticket&api_key=" +
      this.apiKey, false);
    authRequest.send(null);
    if(authRequest.status == 200) {
      var response = authRequest.responseText;
      response = response.replace(
          /^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, ""); // bug 336551
      response = new XML(response);
      if (response.status == "get_ticket_ok") {
        this.ticket = response.ticket
        var windowWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"]
                              .getService(Ci.nsIWindowWatcher);
        this.authWindow = windowWatcher.openWindow(null,
          "https://www.box.net/api/1.0/auth/"+this.ticket,
          "Authorize",
          "all,content,dialog=no,status,toolbar=no,resizable",
          null);
        windowWatcher.registerNotification(this);
      }
    }
  },

  /**
   * Handle the authWindow closing notification.
   */
  observe: function dc_observe(aSubject, aTopic, aData) {
    if (aSubject == this.authWindow && aTopic == "domwindowclosed") {
      var windowWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"]
                            .getService(Ci.nsIWindowWatcher);
      windowWatcher.unregisterNotification(this);
      this.authWindow = null;
      var authRequest = new XMLHttpRequest();
      authRequest.open("GET",
        "https://www.box.net/api/1.0/rest?action=get_auth_token&api_key=" +
        this.apiKey + "&ticket=" + this.ticket, false);
      authRequest.send(null);
      if(authRequest.status == 200) {
        var response = authRequest.responseText;
        response = response.replace(
            /^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, ""); // bug 336551
        response = new XML(response);
        if (response.status == "get_auth_token_ok") {
          this.authkey = response.auth_token;
          // Now that we have an authkey, let's save it.
          if (!this.pref.prefHasUserValue(this.authkeyPref))
            this.pref.setCharPref(this.authkeyPref, this.authkey);
          // And populate the document list.
          this.populateDocumentList();
        }
      }
    }
  },

  callApi: function dc_callApi(aMethod, aArgs, aSuccessCb) {
    url = this.baseUrl + "?action=" + aMethod +
          "&api_key=" + this.apiKey +
          "&auth_token=" + this.authkey;
    for (var name in aArgs)
    {
      url += "&" + name + "=" + encodeURIComponent(aArgs[name]);
    }
    dump("HT: Calling "+url+"\n")
    $.get(url, function callApi_getCb(data) {
      aSuccessCb($(data.documentElement));
    });

  }
};

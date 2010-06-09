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

function addCategories(data) {
  let categories = $("#categories").html("");
  let firstCategory = null;
  for (let index in data) {
    let record = data[index];
    let category = $("<li class='category'></li>");
    category.text(record.folder);
    category.attr("id", record.id);
    categories.append(category);
    if (index == 0)
      firstCategory = category;
  }
  updateTab({"target":firstCategory});
}

function clearContent() {
  $("#preview").html("");
}

function setFolders(folders) {
  clearContent();
  let content = $("<ol class='folders'/>").appendTo($("#preview"));
  $.each(folders, function(i, e) {
    e.count = e.unread || "";
    e.extraClass = e.unread > 0 ? "unread" : "read";
  });
  $("#foldertmpl").render(folders).appendTo(content);
  content.children("li").click(function (e) {showConversations($(this))});
}

function addContent(data) {
  let conversations = $("ol.conversations");
  if (conversations.length == 0)
    conversations = $('<ol class="conversations"/>').appendTo($("#preview"))

  let entry = $('<li class="conversation"/>').appendTo(conversations);
  entry.addClass(("unread" in data && data["unread"].length > 0) ? "unread" : "read");
  entry.attr("id", data["id"]);

  if ("subject" in data)
    $('<div class="subject"/>').text(data["subject"]).appendTo(entry);

  let messages = $('<ol class="messages"/>').appendTo(entry);

  let addMessage = function(messages, message) {
    let msg = $('<li class="message"/>').appendTo(messages);
    $('<span class="from"/>').text(message.from.value).appendTo(msg);
    $('<span class="date"/>').text(message.date.toLocaleString()).appendTo(msg);
    $('<span class="body"/>').text((message.indexedBodyText || "").substr(0, 140)).appendTo(msg);
    return msg;
  };

  for (let unread in data["unread"])
    addMessage(messages, data["unread"][unread]).addClass("unread");
  for (let read in data["messages"])
    addMessage(messages, data["messages"][read]).addClass("read");
  entry.bind("click", function (e) {showMessages($(this))});
}

function addMessage(message) {
  let conversations = $("ol.conversations");
  if (conversations.length == 0)
    conversations = $('<ol class="conversations"/>').appendTo($("#preview"))

  let entry = $('<li class="conversation"/>').appendTo(conversations);

  entry.addClass(message.read ? "read" : "unread");
  entry.attr("id", message.id);

  let msg = $('<li class="message"/>').appendTo(entry);
  $('<span class="from"/>').text(message.from.value).appendTo(msg);
  $('<span class="date"/>').text(""+message.date).appendTo(msg);

  let body = $('<div class="fullbody"/>').appendTo(msg).css("display", "none");
  let synopsis = $('<div class="synopsis">').appendTo(msg);
  if (message.indexedBodyText) {
    synopsis.text(message.indexedBodyText.substr(0, 140));
    synopsis = null;
  }
//  populateMessageBody(message.folderMessage, body, synopsis);

  msg.bind("click", function (e) {showMessage($(this))});
}

function populateMessageBody(id, data) {
  let body = $("#"+id).find(".fullbody");
  body.html(data.documentElement.children);
}

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

/**
 * addEventListener betrayals compel us to establish our link with the
 *  outside world from inside.  NeilAway suggests the problem might have
 *  been the registration of the listener prior to initiating the load.  Which
 *  is odd considering it works for the XUL case, but I could see how that might
 *  differ.  Anywho, this works for now and is a delightful reference to boot.
 */

var hometab;

function reachOutAndTouchFrame(aMode) {
  let us = window.QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIWebNavigation)
                 .QueryInterface(Ci.nsIDocShellTreeItem);

  let parentWin = us.parent
                    .QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIDOMWindow);

  hometab = parentWin.hometab;
  let homeTabType = parentWin.homeTabType;
  homeTabType.modes[aMode].htmlLoadHandler(this);
}

function updateTab(e) {
  let element = $(e.target);
  $("#categories > .category[selected='true']").removeAttr("selected");
  element.attr("selected", "true");
  $("#preview").html("Clicked on tab "+element.attr("id"));
  hometab.showFolders(this, element.attr("id"));
}

function showConversations(element) {
  hometab.showConversations(this, element.attr("id"));
}

function showMessages(element) {
  hometab.showMessages(this, element.attr("id"),
                       element.children(".subject").text());
}

function showMessage(element) {
  element.children(".synopsis").toggle("fast");
  element.children(".fullbody").slideToggle("fast");
}

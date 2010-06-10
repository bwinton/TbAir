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

Components.utils.import("resource:///modules/templateUtils.js");
Components.utils.import("resource:///modules/errUtils.js");

function addCategories(categories) {
  let categoriesElem = $("#categories").html("");
  $("#categorytmpl").render(categories).appendTo(categoriesElem);
  updateTab({"target":categories[0]});
}

function clearContent() {
  $("ol.folders").html("");
  $("ol.conversations").html("");
  $("ol.messages").html("");
}

function setFolders(folders) {
  clearContent();
  let content = $("ol.folders");

  // Augment the data with styles.
  $.each(folders, function(i, e) {
    e.count = e.unread || "";
    e.extraClass = e.unread > 0 ? "unread" : "read";
  });

  // And render the template.
  $("#foldertmpl").render(folders).appendTo(content);
}

function augmentMessage(message) {
  message["extraClass"] = function msg_extraClass() {
    if (this.read)
      return "read";
    else
      return "unread";
  };
  message.fromValue = message.from.value;
  message.friendlyDate = makeFriendlyDateAgo(message.date);
  message.synopsis = (message.indexedBodyText || "").substr(0, 140);
}

function addContent(conversations) {
  let conversationsElem = $("ol.conversations");

  // Augment the data with styles.
  for (let cId in conversations) {
    let conversation = conversations[cId];
    conversation["extraClass"] = function conv_extraClass() {
      if (this.messages[0].read)
        return "read";
      else
        return "unread";
    };
    for (let mId in conversation.messages)
      augmentMessage(conversation.messages[mId]);
  }

  // And render the template.
  $("#conversationtmpl").render(conversations).appendTo(conversationsElem);
}

function addMessages(messages) {
  let messagesElem = $("ol.messages");

  // Augment the data with styles.
  for (let mId in messages)
    augmentMessage(messages[mId]);

  // And render the template.
  $("#messagetmpl").render(messages).appendTo(messagesElem);
}

function populateMessageBody(id, data) {
  let message = $("#"+id);
  let body = message.children(".fullbody");
  body.html(data.documentElement.children);
  if (message.hasClass("unread"))
    showMessage(message);
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
  // $("#preview").html("Clicked on tab "+element.attr("id"));
  hometab.showFolders(this, element.attr("id"));
}

function showConversations(element) {
  hometab.showConversations(this, element.attr("id"));
}

function showMessages(element) {
  hometab.showMessages(this, element.attr("id"),
                       element.children(".subject").text());
}

function handleClick(element, event) {
  if (event.target.tagName == "BLOCKQUOTE") {
    if (event.target.hasAttribute("shown")) {
      event.target.removeAttribute("shown");
    } else {
      event.target.setAttribute("shown", "true");
    }
  } else {
    showMessage(element);
  }
}

function showMessage(element) {
  //dump(element.children(".synopsis").text()+"\n");
  //dump(element.children(".fullbody").text()+"\n");
  element.children(".synopsis").toggle("fast");
  element.children(".fullbody").slideToggle("fast");
}

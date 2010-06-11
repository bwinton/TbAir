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
Components.utils.import("resource:///modules/gloda/utils.js");


function setupHome() {
  $(".column").sortable({
    connectWith: '.column'
    });
  $(".column").disableSelection();
}

function clearContent() {
  $("ol.folders").html("");
  $("ol.conversations").html("");
  $("ol.messages").html("");
}

function setFolders(folders) {
  clearContent();
  let even = (folders.length / $(".column").length) + 1;
  // And render the template.
  $(".column").each(function() {
    $("#folderPortletTmpl").render(folders.splice(0, even)).appendTo($(this))
  })
  ;
}

function setHeaderTitle(name) {
  $(".header > .title").text(name);
}

function augmentMessage(message) {
  message.friendlyDate = makeFriendlyDateAgo(message.date);
  message.synopsis = (message.indexedBodyText || "").substr(0, 140);
  message.avatar = "http://www.gravatar.com/avatar/" +
                   GlodaUtils.md5HashString(message.from.value) +
                   "?d=identicon&s=24&r=g";
}

function addContent(conversations) {
  let conversationsElem = $("ol.conversations");
  let conversationMap = {};
  
  // Augment the data - this could possibly be done on the first pass to save time
  for (let [,conversation] in Iterator(conversations)) {
    // We figure out what strings a conversation would match, and stash that
    // in a DOM node for use by the search field.  Ideally we'd do that on the
    // gloda objects, but for some reason that's not working for me.
    // In particular, conversation.messages is busted.  Is "conversation" not
    // a real GlodaConversation object?
    
    let substrings = [];
    substrings.push(conversation.topic.subject);
    substrings.push(conversation.topic.from.contact.name);
    for (let [,message] in Iterator(conversation.messages)) {
      for (let [,person] in Iterator(message.involves)) {
        substrings.push(person.contact.name)
      }
    }
    let matchString = substrings.join('');

    conversationMap[conversation.id] = matchString;
    conversation.from = conversation.topic.from;
    conversation.subject = conversation.topic.subject;
    conversation.synopsis = (conversation.topic.indexedBodyText || "").substr(0, 140);
    conversation.date = makeFriendlyDateAgo(conversation.topic.date);
    conversation.avatar = "http://www.gravatar.com/avatar/" +
                          GlodaUtils.md5HashString(conversation.topic.from.value) +
                          "?d=identicon&s=24&r=g";

    // Looping again isn't that bad (in big N terms) because we should have limited the
    // number of messages previously to only unread
    for (let [,message] in Iterator(conversation.messages)) {
      augmentMessage(message);
    }
  }

  // And render the template.
  $("#conversationtmpl").render(conversations).appendTo(conversationsElem);
  // cache the gloda objects
  document.getElementById("cache").conversations = conversationMap;
}

function addMessages(messages) {
  let messagesElem = $("ol.messages");

  let messageMap = {};
  // Augment the data with styles.
  for (let mId in messages) {
    augmentMessage(messages[mId]);
    messageMap[messages[mId].id] = messages[mId];
  }

  // And render the template.
  $("#messagetmpl").render(messages).appendTo(messagesElem);
  
  // cache the gloda objects
  document.getElementById("cache").messages = messageMap;
}

function populateMessageBody(id, data) {
  try {
    let message = $("#"+id);
    let body = message.find(".fullbody");
    body.html(data.documentElement.children);
  } catch (e) {
    logException(e);
  }
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

function showConversations(element) {
  hometab.showConversations(this, element.attr("id"));
}

function showMessages(element) {
  let el = element.parents("li.conversation");
  hometab.showMessages(this, el.attr("id"),
                       el.attr("subject"),
                       el.attr("read"));
}


function filterFolders(event) {
  try {
    let filterNode = $(event.target);
    var filter = filterNode.val(), count = 0;
    $(".column .portlet").each(function () {
      let matchString = $(this).children('.portlet-header').text();
      if (matchString.search(new RegExp(filter, "i")) < 0)
        $(this).hide();
      else
        $(this).show();
    });
  } catch (e) {
    logException(e);
  }
}

function filterConversations(event) {
  let filterNode = $(event.target);
  var filter = filterNode.val(), count = 0;
  try {
    $(".filtered:first li.conversation").each(function () {
      id = $(this).attr("id");
      if (id) { // somehow some nodes don't have IDs?
        let matchString = document.getElementById("cache").conversations[id];
        if (matchString) {
          if (matchString.search(new RegExp(filter, "i")) < 0)
            $(this).hide();
          else
            $(this).show();
        }
      }
    });
  } catch (e) {
    logException(e);
  }
}

function filterMessages(event) {
  let filterNode = $(event.target);
  var filter = filterNode.val(), count = 0;
  $(".filtered:first li").each(function () {
    let message = document.getElementById("cache").messages[$(this).attr("id")];
    let matchString = message.indexedBodyText + message.subject + message.from.contact.name;
    if (matchString.search(new RegExp(filter, "i")) < 0)
      $(this).hide();
    else
      $(this).show();
  });
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
  element.find(".synopsis").toggle("fast");
  element.find(".fullbody").slideToggle("fast");
}

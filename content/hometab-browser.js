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

var gCopyService = Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
                     .getService(Components.interfaces.nsIMsgCopyService);


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

function setHeaderTitle(title) {
  $(".header > .title").text(title);
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
  $("#conversationtmpl").render(conversations).each(function(i, li) {
    li.conversation = conversations[i];
    }).appendTo(conversationsElem);
  // cache the gloda objects
  document.getElementById("cache").conversations = conversationMap;
}

function markAsRead(message) {
  try {
    message.folderMessage.markRead(true);
  } catch (e) {
    logException(e);
  }
}

function addMessages(messages) {
  let messagesElem = $("ol.messages");

  let messageMap = {};
  // Augment the data with styles.
  for (let mId in messages) {
    augmentMessage(messages[mId]);
    messageMap[messages[mId].id] = messages[mId];
    markAsRead(messages[mId]); // should really happen on making it into viewport, but...
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
  hometab.showConversations(this, element.attr("id"), element.text());
}

function showMessages(element) {
  let el = element.parents("li.conversation");
  hometab.showMessages(this, el.attr("id"),
                       el.attr("subject"));
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


//--- actions on conversations

function archiveConversation(link) {
  try {
    let conversationElt = link.parents('li.conversation')[0];
    $(conversationElt).slideUp('fast');
    // XXX: update counts of messages in title
    let conversation = conversationElt.conversation;
    let msgHdrs = [];
    for (let [,message] in Iterator(conversation.all)) {
      msgHdrs.push(message.folderMessage);
    }
    let batchMover = new BatchMessageMover();
    batchMover.archiveMessages(msgHdrs);
  } catch (e) {
    logException(e);
  }
}


function deleteConversation(link) {
  try {
    let conversationElt = link.parents('li.conversation')[0];
    $(conversationElt).slideUp('fast');
    // XXX: update counts of messages in title
    let conversation = conversationElt.conversation;
    let folderMap = {};

    // try to be a bit smart and group deletes by folder.
    // this code is a bit messy, could easily be cleaned up.
    let msgHdrs = [];
    let folders = [];
    for (let [,message] in Iterator(conversation.all)) {
      let msgHdr = message.folderMessage;
      if (! msgHdr) {
        dump("uh-oh, got gloda message w/ no real message\n");
        return;
      }
      let folderURI = msgHdr.folder.URI;
      if (folderURI in folderMap) {
        folderMap[folderURI].messages.appendElement(msgHdr, false);
      } else {
        let msgs = Components.classes["@mozilla.org/array;1"].
          createInstance(Components.interfaces.nsIMutableArray);
        
        let folderDict = {
          'URI': folderURI,
          'folder': msgHdr.folder,
          'messages': msgs
        }
        msgs.appendElement(msgHdr, false);
        folderMap[folderURI] = folderDict;
        folders.push(folderDict);
      }
    }
    for (let [, folderDict] in Iterator(folders)) {
      // XXX check these args - and ideally pick up delete model based on prefs.
      folderDict['folder'].deleteMessages(folderDict.messages,
                                          null /*msgWindow*/,
                                          false /* deleteStorage */,
                                          true /* isMove */,
                                          null /* copyservicelistener */,
                                          true /* allowUndo */);
    }
  } catch (e) {
    logException(e);
  }
}


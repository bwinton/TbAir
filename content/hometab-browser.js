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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource:///modules/errUtils.js");
Cu.import("resource:///modules/gloda/utils.js");
Cu.import("resource://app/modules/MailUtils.js");

var gCopyService = Cc["@mozilla.org/messenger/messagecopyservice;1"]
                     .getService(Ci.nsIMsgCopyService);

var log = Application.console.log;

function setupHome() {
  let pref = Cc["@mozilla.org/preferences-service;1"]
               .getService(Ci.nsIPrefBranch);
  let pref_name = "geo.wifi.protocol";
  if (!pref.prefHasUserValue(pref_name))
    pref.setIntPref(pref_name, 0);
  let pref_name = "geo.wifi.uri";
  if (!pref.prefHasUserValue(pref_name))
    pref.setCharPref(pref_name, "https://www.google.com/loc/json");

  var geolocation = Cc["@mozilla.org/geolocation;1"]
                      .getService(Ci.nsIDOMGeoGeolocation);
  geolocation.getCurrentPosition(
    function ht_gotPosition(position) {
      $("#location").html($("#locationTmpl").render({
        lat: position.coords.latitude,
        lon: position.coords.longitude}));
    },
    function ht_gotError(e) {
      log("GeoError: " + e.code + ": " + e.message);
    });
}

var folderMgr = {

  setFolders: function(folders) {
    let even = (folders.length / $(".column").length) + 1;
    // And render the template.
    $(".column").each(function() {
      $("#folderPortletTmpl").render(folders.splice(0, even)).appendTo($(this))
    })
    ;
    let observerService = Components.classes["@mozilla.org/observer-service;1"]
                          .getService(Components.interfaces.nsIObserverService);
    observerService.addObserver(this, "favorite-folder-removed", false);
    observerService.addObserver(this, "favorite-folder-added", false);
    
    // XXX we really do want to removeObservers when the window closes.
  },

  observe : function(aSubject, aTopic, aData) {
    let URI = aData;
    if (aTopic == 'favorite-folder-added') {
      this.addFavoriteFolder(URI);
    } else {
      this.removeFavoriteFolder(URI);
    }
  },

  removeFavoriteFolder: function(URI) {
    let node = document.getElementById(encodeURI(URI));
    node.parentNode.removeChild(node);
  },
  
  addFavoriteFolder: function(URI) {
    let folder = MailUtils.getFolderForURI(URI, true);
    let _unread = folder.getNumUnread(false);
    let data = {name: folder.name,
                serverName: folder.server.prettyName,
                read: (_unread <= 0),
                unread: (_unread || ""),
                dupe : false,
                id: folder.URI};
    this.addFaveFolder(data);
  },
  addFaveFolder: function(folderData) {
    $("#foldertmpl").render(folderData).appendTo($(".homeMenu")).attr("id", encodeURI(folderData['id']));
  }
}

function setHeaderTitle(title) {
  $(".header > .title").text(title);
}

function updateHeart(aUri) {
  $("#love").attr('uri', aUri); // stash away for toggleHeart
  let URI = $("#love").attr('uri');
  let folder = MailUtils.getFolderForURI(aUri, true);
  if (folder) {
    if (folder.flags & Ci.nsMsgFolderFlags.Favorite) {
      $("#unhearted").hide();
      $("#hearted").show();
    } else {
      $("#hearted").hide();
      $("#unhearted").show();
    }
  } else {
    $("#hearted").hide();
    $("#unhearted").hide();
  }
}

function toggleHeart() {
  let URI = $("#love").attr("uri");
  let folder = MailUtils.getFolderForURI(URI, true);
  let observerService = Components.classes["@mozilla.org/observer-service;1"]
                        .getService(Components.interfaces.nsIObserverService);
  if (folder.flags & Ci.nsMsgFolderFlags.Favorite) {
    folder.flags &= ~Ci.nsMsgFolderFlags.Favorite;
    observerService.notifyObservers(null, "favorite-folder-removed", URI);
  } else {
    folder.flags |= Ci.nsMsgFolderFlags.Favorite;
    observerService.notifyObservers(null, "favorite-folder-added", URI);
  }
  updateHeart(URI);
}

function addContent(conversations) {
  let conversationMap = {};

  for (let [,conversation] in Iterator(conversations)) {
    // We figure out what strings a conversation would match, and stash that
    // in a DOM node for use by the search field.
    conversationMap[conversation.id] = conversation.match;
  }

  // And render the template.
  $("#conversationtmpl").render(conversations).each(function(i, li) {
    li.conversation = conversations[i];
    }).appendTo($("ol.conversations"));
  // cache the gloda objects
  document.getElementById("cache").conversations = conversationMap;
}

function removeConversations(conversations, all) {
  let conversationMap = {};

  for (let [,conversation] in Iterator(conversations)) {
    $("#"+ conversation.id).remove();
  }

  // Re-build the conversation map for searching
  for (let [,conversation] in Iterator(all)) {
    // We figure out what strings a conversation would match, and stash that
    // in a DOM node for use by the search field.
    conversationMap[conversation.id] = conversation.match;
  }

  // cache the gloda objects
  document.getElementById("cache").conversations = conversationMap;
}

function updateConversations(conversations) {
  let conversationMap = {};

  for (let [,conversation] in Iterator(conversations)) {
    // We figure out what strings a conversation would match, and stash that
    // in a DOM node for use by the search field.
    conversationMap[conversation.id] = conversation.match;

    let oldConversation = $("#"+ conversation.id);
    let newConversation = $("#conversationtmpl").render(conversation);
    // This is a new conversation

    if (oldConversation.length <= 0 || oldConversation.attr("timestamp") != newConversation.attr("timestamp")) {
      $("ol.conversations").each(function() {
        if($(this).attr("timestamp") < newConversation.attr("timestamp")) {
          Application.console.log("removed: " + "li#"+ oldConversation.attr("timestamp"));
          oldConversation.remove();
          Application.console.log("added: " + "li#"+ newConversation.attr("timestamp"));
          newConversation.insertBefore($(this))
          return; // Leave this loop
        }
      })
    // An existing conversation was modified somehow, just re-render it
    } else {
      oldConversation.replaceWith(newConversation);
    }
  }

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

function addParticipants(aTopic, aMyIdentites, aIsListConversation, aListConversationInvolves) {
  let involves = [];

  if (aIsListConversation) {
    let list = aTopic.mailingLists.pop();
    $("#participanttmpl").render(list).appendTo($(".list .to ol.participants"));
    $("div.list").show();
    involves = [id for each (id in aListConversationInvolves)];
    if (involves.length > 1) {
      // this message involves is about everyone in the conversation
      $("#participanttmpl").render(involves).appendTo($(".list .involving ol.participants"));
      $("div.list > div.involving").show();
    }

  } else {
    involves = aTopic.involves;

    if ( aTopic.toMe && ! aTopic.fromMe && aTopic.involves.length == 2 ) {
      Application.console.log("A Message to you!");
      involves = aTopic.involves.filter(function removeMe(id) { return ! (id.id in aMyIdentites); });
      $("#participanttmpl").render(involves).appendTo($(".direct .from ol.participants"));
      $("div.direct .from").show();
    } else if ( aTopic.fromMe ) {
      involves = aTopic.involves.filter(function removeMe(id) { return ! (id.id in aMyIdentites); });
      Application.console.log("A Message from you!");
      $("#participanttmpl").render(involves).appendTo($(".direct .to ol.participants"));
      $("div.direct .to").show();

    } else {
      aTopic.involves.forEach(function labelMe(id) { if (id.id in aMyIdentites) id.contact.name = "me"; });
      // non list messages only show the people from the topic
      $("#participanttmpl").render(involves).appendTo($(".group ol.participants"));
      $("div.group").show();
    }

  }
}

function addMessages(messages) {
  let messageMap = {};
  let read = 0;
  // Augment the data with styles.
  for each(let [i,message] in Iterator(messages)) {
    messageMap[message.id] = message;
    if(!message.read)
      markAsRead(message); // should really happen on making it into viewport, but...
    else
      read++;
  }
  // And render the template.
  $("#messagetmpl").render(messages).appendTo($("ol.messages"));

  // If we have read messages we'll hide them so lets show the load helper bar
  if (read > 0)
    if (messages.length <= 2)
      // If we're only looking at two or less messages lets just show them
      $("ol.messages li.message:first-child").fadeIn();
    else
    // Give a count of messages that aren't visible because they are read
    $(".old").fadeIn().find(".count").text($("ol.messages li.message").not(":visible").length);

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

function populateAttachment(aMessageKey, aAttachments) {
  try {
    let attachments = $(".message[messageKey='"+aMessageKey+"'] .attachments");
    for each(let [,attachment] in Iterator(aAttachments)) {
      let li = attachments.find("[name='"+attachment.name+"'][mimetype='"+attachment.fullType+"']");
      if (!attachment.isReal)
        li.remove()
      else
        li.attr({"url" : attachment.url, "uri" : attachment.uri,
                 "isExternal" : attachment.isExternal})
    }
  } catch (e) {
    logException(e);
  }
}

function openAttachment(element) {
  //document.location = element.attr("url");
  hometab.openAttachment(element);
}

function addContacts(me, contacts) {
  $("#contacttmpl").render(contacts).appendTo(".contacts");
}

function addAttachments(attachments) {
  $("#attachmenttmpl").render(attachments).appendTo($("ol.attachments"));
}

function thumbnailAttachments(aMessageKey, aAttachments) {
  try {
    for each(let [,attachment] in Iterator(aAttachments)) {
      let li = $(".attachment[messageKey='"+aMessageKey+"'][name='"+attachment.name+"']");
      li.attr("url", attachment.url);
      li.find(".name").attr("url",  attachment.url);
      li.find("img").attr("url",  attachment.url);
      if ((/^image\//).test(attachment.fullType)) {
        // We can get fancy like the attachments tab later
        li.find("img").attr("src", attachment.url).addClass("thumbnailed");
      }
    }
  } catch (e) {
    logException(e);
  }
}

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

function showConversations(event, element) {
  // XXX: The metaKey is mac only we need an if (!mac) event.ctrlKey case
  // XXX: The middle button is not being detected correctly right now
  let background = event.metaKey || (event.button == 1);
  log("tabmail=" + hometab.tabmail);
  hometab.tabmail.openTab("folderList", {
    id: element.attr("id"),
    background: background
  });
}

function openSubTab(aType, aArgs) {
  let tabInfo = hometab.tabmail.tabInfo;
  let tabContainer = hometab.tabmail.tabContainer;
  let index = tabInfo.indexOf(hometab.tabmail.currentTabInfo);
  hometab.tabmail.openTab(aType, aArgs);
  // Move the new tab into position, if it's not already the last child.
  if (index != tabContainer.children.length - 1) {
    let last = tabInfo.pop();
    tabInfo.splice(index+1, 0, last);
    last = tabContainer.lastElementChild;
    tabContainer.removeChild(last);
    tabContainer.insertBefore(last, tabContainer.children[index+1]);
  }
}

function showMessages(event, element) {
  let el = element.parents("li.conversation");
  // XXX: The metaKey is mac only we need an if (!mac) event.ctrlKey case
  // XXX: The middle button is not being detected correctly right now
  let background = event.metaKey || (event.button == 1);
  openSubTab("messageList", {
    id: el.attr("id"),
    title: el.attr("subject"),
    background : background
  });
}

function showContacts(event) {
  // XXX: The metaKey is mac only we need an if (!mac) event.ctrlKey case
  // XXX: The middle button is not being detected correctly right now
  let background = event.metaKey || (event.button == 1);
  hometab.showContacts(background);
}

function showDocuments(event) {
  // XXX: The metaKey is mac only we need an if (!mac) event.ctrlKey case
  // XXX: The middle button is not being detected correctly right now
  let background = event.metaKey || (event.button == 1);
  hometab.showDocuments(background);
}

function showAttachments(event) {
  // XXX: The metaKey is mac only we need an if (!mac) event.ctrlKey case
  // XXX: The middle button is not being detected correctly right now
  let background = event.metaKey || (event.button == 1);
  hometab.showAttachments(background);
}

function showSource(event) {
  // XXX: The metaKey is mac only we need an if (!mac) event.ctrlKey case
  // XXX: The middle button is not being detected correctly right now
  let background = event.metaKey || (event.button == 1);
  hometab.showSource(background);
}

var specialFilters = [
  function handleUnreadFilter(filter, elem) {
    if (filter == ":unread") {
      if (elem.attr("read") == "true")
        elem.hide();
      else
        elem.show();
     return;
    }
  },
];

function handleSpecialFilters(filter, elem) {
  if (filter && filter[0] == ":") {
    for (let i in specialFilters) {
      specialFilters[i](filter, elem);
    }
    return true;
  }
  return false;
}

function filterFolders(event) {
  try {
    let filterNode = $(event.target);
    var filter = filterNode.val(), count = 0;
    $(".column .portlet").each(function () {
      if (handleSpecialFilters(filter, $(this)))
        return;
      let matchString = $(this).children('.portlet-header').text();
      if (matchString.search(new RegExp(filter, "i")) < 0)
        $(this).hide();
      else
        $(this).show();
    });
    if (event.keyCode == event.DOM_VK_RETURN) {
      let items = $(".column .portlet:visible");
      if (items.length == 1) {
        showConversations(event, items.children(".portlet-header"));
      }
    }
  } catch (e) {
    logException(e);
  }
}

function filterConversations(event) {
  let filterNode = $(event.target);
  var filter = filterNode.val(), count = 0;
  try {
    $(".filtered:first li.conversation").each(function () {
      if (handleSpecialFilters(filter, $(this)))
        return;
      let id = $(this).attr("id");
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
    if (event.keyCode == event.DOM_VK_RETURN) {
      let items = $(".column .topic:visible");
      if (items.length == 1) {
        showMessages(event, items.children(".subject"));
      }
    }
  } catch (e) {
    logException(e);
  }
}

function filterMessages(event) {
  let filterNode = $(event.target);
  var filter = filterNode.val(), count = 0;
  $(".filtered:first li").each(function () {
    if (handleSpecialFilters(filter, $(this)))
      return;
    let message = document.getElementById("cache").messages[$(this).attr("id")];
    if (!message)
      return;
    let matchString = message.indexedBodyText + message.subject + message.from.contact.name;
    if (matchString.search(new RegExp(filter, "i")) < 0)
      $(this).hide();
    else
      $(this).show();
  });
}

function filterContacts(event) {
  try {
    let filterNode = $(event.target);
    var filter = filterNode.val(), count = 0;
    $(".contact ").each(function () {
      let matchString = $(this).find(".name").text() + $(this).find(".identity").text();;
      if (matchString.search(new RegExp(filter, "i")) < 0)
        $(this).hide();
      else
        $(this).show();
    });
  } catch (e) {
    logException(e);
  }
}

function filterAttachments(event) {
  try {
    let filterNode = $(event.target);
    var filter = filterNode.val(), count = 0;
    $(".attachment ").each(function () {
      let matchString = $(this).text();
      if (matchString.search(new RegExp(filter, "i")) < 0)
        $(this).hide();
      else
        $(this).show();
    });
  } catch (e) {
    logException(e);
  }
}

function filterSource(event) {
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

function handleClick(element, event) {
  if (event.target.tagName == "BLOCKQUOTE") {
    if (event.target.hasAttribute("shown")) {
      event.target.removeAttribute("shown");
    } else {
      event.target.setAttribute("shown", "true");
    }
  }
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
        let msgs = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);

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
                                          false /* allowUndo */);
    }
  } catch (e) {
    logException(e);
  }
}

//--- actions on messages

function replyMessage(event, element) {
  hometab.replyMessage(element.attr("folderMessageURI"),
                       element.attr("folderURI"));
}

function replyAllMessage(event, element) {
  hometab.replyAllMessage(element.attr("folderMessageURI"),
                       element.attr("folderURI"));
}

//--- actions on contacts

function composeMessage(element) {
  if ("email" != element.attr("kind"))
    return;
  hometab.composeMessage(element.text())
}

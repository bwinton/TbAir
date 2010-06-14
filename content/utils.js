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
 * The Original Code is Thunderbird
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * David Ascher <david.ascher@gmail.com>
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

Components.utils.import("resource:///modules/MailUtils.js");

// This is ripped from TB, but with some expectations removed like the presence of specific globals.
// XXX it should move to a module most likely.

function BatchMessageMover()
{
  this._batches = {};
  this._currentKey = null;
}

BatchMessageMover.prototype = {

  archiveMessages: function(msgHdrs)
  {
    try {
      let messages = Components.classes["@mozilla.org/array;1"]
                               .createInstance(Components.interfaces.nsIMutableArray);
  
      for (let i = 0; i < msgHdrs.length; ++i)
      {
        let msgHdr = msgHdrs[i];
  
        let server = msgHdr.folder.server;
        let rootFolder = server.rootFolder;
  
        let msgDate = new Date(msgHdr.date / 1000);  // convert date to JS date object
        let msgYear = msgDate.getFullYear().toString();
        let monthFolderName = msgDate.toLocaleFormat("%Y-%m")
        let archiveFolderUri;
  
        if (server.type == 'rss') {
          // RSS servers don't have an identity so we special case the archives URI.
          archiveFolderUri =  server.serverURI + "/Archives";
        }
        else {
          let identity = getIdentityForServer(server);
          // Local Folders server doesn't have an identity, so if we don't
          // get an identity from the server, figure it out from the message.
          if (!identity)
            identity = getIdentityForHeader(msgHdr);
          archiveFolderUri = identity.archiveFolder;
        }
        let archiveFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
        let granularity = archiveFolder.server.archiveGranularity;
  
        let copyBatchKey = msgHdr.folder.URI + '\u0000';
        if (granularity >= Components.interfaces.nsIMsgIncomingServer
                                     .perYearArchiveFolders)
          copyBatchKey += msgYear;
  
        if (granularity >=  Components.interfaces.nsIMsgIncomingServer
                                      .perMonthArchiveFolders)
          copyBatchKey += monthFolderName;
  
        let keepFolderStructure = archiveFolder.server.archiveKeepFolderStructure;
        if (keepFolderStructure)
          copyBatchKey += msgHdr.folder.URI;
  
         // Add a key to copyBatchKey
         if (! (copyBatchKey in this._batches)) {
          this._batches[copyBatchKey] = [msgHdr.folder, archiveFolderUri,
                                         granularity, keepFolderStructure,
                                         msgYear, monthFolderName];
        }
        this._batches[copyBatchKey].push(msgHdr);
      }
      // Now we launch the code that will iterate over all of the message copies
      // one in turn
      this.processNextBatch();
    } catch (e) {
      logException(e);
    }
  },

  processNextBatch: function()
  {
    try {
      for (let key in this._batches)
      {
        this._currentKey = key;
        let batch = this._batches[key];
        let srcFolder = batch[0];
        let archiveFolderUri = batch[1];
        let granularity = batch[2];
        let keepFolderStructure = batch[3];
        let msgYear = batch[4];
        let msgMonth = batch[5];
        let msgs = batch.slice(6, batch.length);
        let subFolder, dstFolder;
        let initFolderLevel = 1;
        let Ci = Components.interfaces;
        let archiveFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
        let isImap = archiveFolder.server.type == "imap";
        if (!archiveFolder.parent) {
          // make sure there's not an other archive folder with
          // a case-insensitive (ci) matching name. If so, we're going
          // to use that folder instead.
          let ciArchive = archiveFolder.server.rootFolder
                          .getChildWithURI(archiveFolderUri, true, true);
          if (ciArchive)
          {
            // Found an archive folder with a different case. Switch
            // our variables to use the new folder, and if we have an identity,
            // make it point to the new folder.
            archiveFolder = ciArchive;
            archiveFolderUri = ciArchive.URI;
            let identity = getIdentityForServer(srcFolder.server);
            // Local Folders server doesn't have an identity, so if we don't
            // get an identity from the server, figure it out from the message.
            if (!identity)
              identity = getIdentityForHeader(msgs[0]);
            if (identity)
              identity.archiveFolder = archiveFolderUri;
          }
          archiveFolder.setFlag(Ci.nsMsgFolderFlags.Archive);
          if (!ciArchive) {
            archiveFolder.createStorageIfMissing(this);
            // For imap folders, we need to create the sub-folders asynchronously,
            // so we return and chain the urls using the listener called back from
            // createStorageIfMissing. For local, createStorageIfMissing is
            // synchronous.
            if (isImap)
              return;
          }
        }
        let forceSingle = !archiveFolder.canCreateSubfolders;
        if (!forceSingle && isImap)
          forceSingle = archiveFolder.server
                         .QueryInterface(Ci.nsIImapIncomingServer).isGMailServer;
        if (forceSingle)
          granularity = Ci.nsIMsgIncomingServer.singleArchiveFolder;
  
        if (granularity >= Ci.nsIMsgIncomingServer.perYearArchiveFolders) {
          archiveFolderUri += "/" + msgYear;
          subFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
          if (!subFolder.parent) {
            subFolder.createStorageIfMissing(this);
            if (isImap)
              return;
          }
          if (granularity >=  Ci.nsIMsgIncomingServer.perMonthArchiveFolders) {
            archiveFolderUri += "/" + msgMonth;
            dstFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
            if (!dstFolder.parent) {
              dstFolder.createStorageIfMissing(this);
              if (isImap)
                return;
            }
          }
          else {
            dstFolder = subFolder;
          }
        }
        else {
          dstFolder = archiveFolder;
        }
       // Create the folder structure in Archives
       if (keepFolderStructure) {
           let dstFolder2;
           // Detect the root folder of message
           let server = batch[0].server;
           let InitialFolderLevel = server.rootFolder;
           // Find the folder structure to create
           let folderURI = batch[0].URI.split(InitialFolderLevel.URI).toString().substr(1).split("/");
           if (folderURI[1] == "INBOX")
               initFolderLevel = 2;
           for (let i = initFolderLevel; i < folderURI.length; i++) {
               archiveFolderUri += "/" + folderURI[i];
               dstFolder2 = MailUtils.getFolderForURI(archiveFolderUri, false);
               if (!dstFolder2.parent) {
                   dstFolder2.createStorageIfMissing(this);
                   if (isImap)
                      return;
               }
           }
           dstFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
       }
        if (dstFolder != srcFolder) {
          var mutablearray = Components.classes["@mozilla.org/array;1"]
                              .createInstance(Components.interfaces.nsIMutableArray);
          msgs.forEach(function (item) {
            mutablearray.appendElement(item, false);
          });
          // If the source folder doesn't support deleting messages, we
          // make archive a copy, not a move.
          gCopyService.CopyMessages(srcFolder, mutablearray,
                                    dstFolder, srcFolder.canDeleteMessages, this, null, true);
          this._currentKey = key;
          break; // only do one.
        }
        else {
         delete this._batches[key];
        }
      }
    } catch (e) {
      logException(e);
    }
  },

  OnStartRunningUrl: function(url) {
  },

  OnStopRunningUrl: function(url, exitCode)
  {
    // this will always be a create folder url, afaik.
    if (Components.isSuccessCode(exitCode))
      this.processNextBatch();
    else
      this._batches = null;
  },

  // also implements nsIMsgCopyServiceListener, but we only care
  // about the OnStopCopy
  OnStartCopy: function() {
  },
  OnProgress: function(aProgress, aProgressMax) {
  },
  SetMessageKey: function(aKey) {
  },
  GetMessageId: function() {
  },
  OnStopCopy: function(aStatus)
  {
    if (Components.isSuccessCode(aStatus)) {
      // remove batch we just finished
      delete this._batches[this._currentKey];
      this._currentKey = null;

      // is there a safe way to test whether this._batches is empty?
      let empty = true;
      for (let key in this._batches) {
        empty = false;
      }

      if (!empty)
        this.processNextBatch();
    }
  },
  QueryInterface: function(iid) {
    if (!iid.equals(Components.interfaces.nsIUrlListener) &&
      !iid.equals(Components.interfaces.nsIMsgCopyServiceListener) &&
      !iid.equals(Components.interfaces.nsISupports))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  }
}


// Utility functions needed (copied from TB)

function getIdentityForServer(server, optionalHint)
{
    var identity = null;

    if (server) {
        var accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"]
          .getService(Components.interfaces.nsIMsgAccountManager);
        // Get the identities associated with this server.
        var identities = accountManager.GetIdentitiesForServer(server);
        // dump("identities = " + identities + "\n");
        // Try and find the best one.
        identity = getBestIdentity(identities, optionalHint);
    }

    return identity;
}

function getBestIdentity(identities, optionalHint)
{
  var identity = null;
  var identitiesCount = identities.Count();

  try
  {
    // if we have more than one identity and a hint to help us pick one
    if (identitiesCount > 1 && optionalHint) {
      // normalize case on the optional hint to improve our chances of finding a match
      optionalHint = optionalHint.toLowerCase();

      var id;
      // iterate over all of the identities
      var tempID;

      var lengthOfLongestMatchingEmail = 0;
      for each (var tempID in fixIterator(identities,
                                          Components.interfaces.nsIMsgIdentity)) {
        if (optionalHint.indexOf(tempID.email.toLowerCase()) >= 0) {
          // Be careful, the user can have several adresses with the same
          // postfix e.g. aaa.bbb@ccc.ddd and bbb@ccc.ddd. Make sure we get the
          // longest match.
          if (tempID.email.length > lengthOfLongestMatchingEmail) {
            identity = tempID;
            lengthOfLongestMatchingEmail = tempID.email.length;
          }
        }
      }

      // if we could not find an exact email address match within the hint fields then maybe the message
      // was to a mailing list. In this scenario, we won't have a match based on email address.
      // Before we just give up, try and search for just a shared domain between the hint and
      // the email addresses for our identities. Hey, it is better than nothing and in the case
      // of multiple matches here, we'll end up picking the first one anyway which is what we would have done
      // if we didn't do this second search. This helps the case for corporate users where mailing lists will have the same domain
      // as one of your multiple identities.

      if (!identity) {
        for (id = 0; id < identitiesCount; ++id) {
          tempID = identities.GetElementAt(id).QueryInterface(Components.interfaces.nsIMsgIdentity);
          // extract out the partial domain
          var start = tempID.email.lastIndexOf("@"); // be sure to include the @ sign in our search to reduce the risk of false positives
          if (optionalHint.search(tempID.email.slice(start).toLowerCase()) >= 0) {
            identity = tempID;
            break;
          }
        }
      }
    }
  }
  catch (ex) {
    logException(e)
  }

  // Still no matches ?
  // Give up and pick the first one (if it exists), like we used to.
  if (!identity && identitiesCount > 0)
    identity = identities.GetElementAt(0).QueryInterface(Components.interfaces.nsIMsgIdentity);

  return identity;
}





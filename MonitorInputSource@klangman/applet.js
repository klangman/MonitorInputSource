/*
 * applet.js
 * Copyright (C) 2023 Kevin Langman <klangman@gmail.com>
 *
 * MonitorInputSource is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * MonitorInputSource is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;
const Lang = imports.lang;
const Main = imports.ui.main;
const Util = imports.misc.util;
const SignalManager = imports.misc.signalManager;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const UUID = "MonitorInputSource@klangman";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(text) {
  let locText = Gettext.dgettext(UUID, text);
  if (locText == text) {
    locText = window._(text);
  }
  return locText;
}

let app = null;

function readDisplay(stdout, stderr, exitCode) {
   if (exitCode===0) {
      // Read the stdout lines looking for "Feature: 60"
      let lines = stdout.split('\n');
      for (let i=0 ; i < lines.length ; i++) {
         if (lines[i].startsWith("Model:")) {
            this.name = lines[i].slice(7);
         } else if (lines[i].includes("Feature: 60") && i+1 < lines.length && lines[i+1].includes("Values:")) {
            for ( i=i+2 ; i<lines.length && !lines[i].includes("Feature:") ; i++ ) {
               this.inputs.push( parseInt(lines[i], 16 ) );
               this.inputNames.push( lines[i].slice(lines[i].indexOf(": ")+2) );
            }
            // Get the current input
            //Util.spawnCommandLineAsyncIO( "ddcutil -d " + this.number + " getvcp 60", Lang.bind(this, readCurrentInput) );
            this.initilized = true;
            break;
         }
      }
      log( `Display ${this.number} ${this.name} ${this.serialNum} ${this.productCode} inputs=${this.inputs} names=${this.inputNames}` );

      // Save this monitor in the persistent cache
      let monitorCache = app.settings.getValue("monitor-cache");
      let cacheEntry = {name: this.name, serialNum: this.serialNum, productCode: this.productCode, inputs: this.inputs, inputNames: this.inputNames};
      monitorCache.push(cacheEntry);
      app.settings.setValue("monitor-cache", monitorCache);

      // To avoid errors when running commands asynchronously, we only run the next command now, after this one has ends
      for (let i=0 ; i < app.displays.length ; i++) {
         if (app.displays[i].initilized === false) {
            Util.spawnCommandLineAsyncIO( "ddcutil -d " + app.displays[i].number + " capabilities", Lang.bind(app.displays[i], readDisplay) );
            return;
         }
      }
   } else {
      // ddcutil returned an error code
      this.exitCode=exitCode;
   }
   // Now that all uninitilized displays have been read, we can update the menu!
   app.updateMenu();
}

function readCurrentInput(stdout, stderr, exitCode) {
   if (exitCode===0) {
      // Read the stdout line and extract the hex value after the "="
      this.currentInput = parseInt(stdout.slice(stdout.indexOf("=")+1));
      // If there is an existing menu item then update the item with the default icon
      //let inputIdx = this.inputs.indexOf(this.currentInput);
      //if (inputIdx >= 0 && this.menuItems.length > inputIdx && this.menuItems[inputIdx] != null) {
      //   this.menuItems[inputIdx].addActor(new St.Icon({ style_class: 'popup-menu-icon', icon_name: 'emblem-default', icon_type: St.IconType.SYMBOLIC }));
      //} else {
         app.updateMenu();
      //}
   } else {
      // ddcutil returned an error code, but we will ignore it.
   }
}


class InputSourceApp extends Applet.IconApplet {

   constructor(orientation, panelHeight, instanceId) {
      super(orientation, panelHeight, instanceId);
      this._signalManager = new SignalManager.SignalManager(null);
      this.set_applet_icon_symbolic_name("video-display-symbolic");
      this.set_applet_tooltip("Select monitor input source");
      this.menu = new Applet.AppletPopupMenu(this, orientation);
      this.menuManager = new PopupMenu.PopupMenuManager(this);
      this.menuManager.addMenu(this.menu);
      this.settings = new Settings.AppletSettings(this, UUID, instanceId);

      this.displays = [];
      this.exitCode = 0;
      app = this;
   }

   on_applet_added_to_panel() {
      Util.spawnCommandLineAsyncIO( "ddcutil detect", Lang.bind(this, this._readDisplays) );
      // Add a "detecting" menu item in case the detecting phase take a long time
      let item = new PopupMenu.PopupIconMenuItem(_("Detecting monitors..."), "video-display-symbolic", St.IconType.SYMBOLIC);
      item.actor.set_reactive(false);
      this.menu.addMenuItem(item);
   }

   on_applet_clicked() {
     this.menu.toggle();
     //if (this.displays.length>0) {
     //   Util.spawnCommandLineAsyncIO( "ddcutil -d " + this.displays[i].number + " getvcp 60", Lang.bind(this.displays[0], readCurrentInput) );
     //}
   }


   // Call back routine that gets the output for "ddcutil detect"
   _readDisplays(stdout, stderr, exitCode) {
      if (exitCode===0) {
         // Read the stdout lines looking for "Display #"
         let lines = stdout.split('\n');
         let display;
         let displayNumber;
         for (let i in lines) {
            if (lines[i].startsWith("Display ")) {
               displayNumber = parseInt(lines[i].charAt(8));
               display = {number: displayNumber, name: "", serialNum: -1, productCode: -1, currentInput: -1, initilized: false, inputs: [], inputNames: [], menuItems: []};
               this.displays.push( display );
               //Util.spawnCommandLineAsyncIO( "ddcutil -d " + displayNumber + " capabilities", Lang.bind(display, readDisplay) );
            } else if (lines[i].includes("Binary serial number:") && display) {
               display.serialNum = parseInt(lines[i].slice(lines[i].indexOf(":")+1));
            } else if (lines[i].includes("Product code:") && display) {
               display.productCode = parseInt(lines[i].slice(lines[i].indexOf(":")+1));
            }
         }
         if (this.displays.length === 0) {
            this.updateMenu(); // Show no monitors were found in the menu
         } else {
            // Check if any of the displays have been cached
            let monitorCache = this.settings.getValue("monitor-cache");
            let firstUnknownDisplay = null;
            for (let i=0 ; i < this.displays.length ; i++) {
               let idx=0;
               for ( ; idx < monitorCache.length ; idx++) {
                  if (monitorCache[idx].serialNum == this.displays[i].serialNum && monitorCache[idx].productCode == this.displays[i].productCode) {
                     // Load the display settings from the persistent cache
                     log( `Loading monitor from cache ${monitorCache[idx].name}` );
                     this.displays.initilized = true;
                     this.displays[i].name = monitorCache[idx].name;
                     this.displays[i].inputs = monitorCache[idx].inputs;
                     this.displays[i].inputNames = monitorCache[idx].inputNames;
                     break;
                  }
               }
               if (idx === monitorCache.length && firstUnknownDisplay===null) {
                  firstUnknownDisplay = this.displays[0];
               }
            }
            // If there are any unknown monitors, then read the details now
            if (firstUnknownDisplay) {
               Util.spawnCommandLineAsyncIO( "ddcutil -d " + this.displays[0].number + " capabilities", Lang.bind(firstUnknownDisplay, readDisplay) );
            } else {
               // There are no unknown monitors so we can update the menu now
               this.updateMenu();
            }
         }
      } else {
         // ddcutil returned an error code
         this.exitCode = exitCode;
         this.updateMenu(); // Show the error in the menu
      }
   }

   updateMenu() {
      let item;
      this.menu.removeAll();
      if (this.displays.length === 0) {
         if (this.exitCode == 127) {
            item = new PopupMenu.PopupIconMenuItem(_("Required \"ddcutil\" not found"), "emblem-important", St.IconType.SYMBOLIC);
            item.actor.set_reactive(false);
            this.menu.addMenuItem(item);
         } else if (this.exitCode != 0) {
            item = new PopupMenu.PopupIconMenuItem(_("Error, \"ddcutil\" exit code ") + this.exitCode, "emblem-important", St.IconType.SYMBOLIC);
            item.actor.set_reactive(false);
            this.menu.addMenuItem(item);
         } else {
            item = new PopupMenu.PopupIconMenuItem(_("No capable monitors detected"), "emblem-important", St.IconType.SYMBOLIC);
            item.actor.set_reactive(false);
            this.menu.addMenuItem(item);
         }
      } else {
         for (let i=0 ; i<this.displays.length ; i++) {
            if (i!=0) {
               // Add a separator
               this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
            item = new PopupMenu.PopupIconMenuItem(this.displays[i].name, "video-display-symbolic", St.IconType.SYMBOLIC);
            item.actor.set_reactive(false);
            this.menu.addMenuItem(item);
            for (let idx=0 ; idx < this.displays[i].inputNames.length ; idx++ ) {
               item = new PopupMenu.PopupMenuItem("\t" + this.displays[i].inputNames[idx]);
               // Would need to use a PopupIconMenuItem here to allow the emblem-default icon to show up correctly at the end of the label
               //if (this.displays[i].currentInput === this.displays[i].inputs[idx]) {
               //   item.addActor(new St.Icon({ style_class: 'popup-menu-icon', icon_name: 'emblem-default', icon_type: St.IconType.SYMBOLIC }));
               //}
               this.displays[i].menuItems.push(item);
               item.connect("activate", Lang.bind(this, function()
                  {
                     Util.spawnCommandLine( "ddcutil -d " + this.displays[i].number + " setvcp 60 0x" + this.displays[i].inputs[idx].toString(16));
                  }));
               this.menu.addMenuItem(item);
            }
         }
      }
      // Add a separator
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      // Add a "Refresh" menu item
      item = new PopupMenu.PopupIconMenuItem(_("Refresh"), "view-refresh", St.IconType.SYMBOLIC);
      item.connect("activate", Lang.bind(this, function() 
         {
            this.displays = [];
            // Add a "detecting" menu item in case the detecting phase takes a long time
            this.menu.removeAll();
            item = new PopupMenu.PopupIconMenuItem(_("Detecting monitors..."), "video-display-symbolic", St.IconType.SYMBOLIC);
            item.actor.set_reactive(false);
            this.menu.addMenuItem(item);
            Util.spawnCommandLineAsyncIO( "ddcutil detect", Lang.bind(this, this._readDisplays) );
         }));
      this.menu.addMenuItem(item);
   }
}

// Called by cinnamon when starting this applet
function main(metadata, orientation, panelHeight, instanceId) {
  return new InputSourceApp(orientation, panelHeight, instanceId);
}
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

function readInputs(stdout, stderr, exitCode) {
   if (exitCode===0) {
      // Read the stdout lines looking for "Feature: 60"
      let lines = stdout.split('\n');
      for (let i=0 ; i < lines.length ; i++) {
         if (lines[i].startsWith("Model:")) {
            this.name = lines[i].slice(7);
         }else if (lines[i].includes("Feature: 60") && i+1 < lines.length && lines[i+1].includes("Values:")) {
            for ( i=i+2 ; i<lines.length && !lines[i].includes("Feature:") ; i++ ) {
               this.inputs.push( parseInt(lines[i], 16 ) );
               this.inputNames.push( lines[i].slice(lines[i].indexOf(": ")+2) );
            }
            // No point unless we can detect when the current input has been changed my means other then through this applet
            //Util.spawnCommandLineAsyncIO( "ddcutil -d " + this.number + " getvcp 60", Lang.bind(this, readCurrentInput) );
            break;
         }
      }
      //log( `Display ${this.number} ${this.name}` );
      //log( `Inputs found: ${this.inputs}` );
      //log( `Input names: ${this.inputNames}` );
   } else {
      // ddcutil returned an error code
      this.exitCode=exitCode;
   }
   app.updateMenu();
}

function readCurrentInput(stdout, stderr, exitCode) {
   log( `Looking for current input of display ${this.number} ec:${exitCode} ...` );
   if (exitCode===0) {
      // Read the stdout line and extract the hex value after the "="
      this.currentInput = parseInt(stdout.slice(stdout.indexOf("=")+1));
      app.updateMenu();
   } else {
      // ddcutil returned an error code
      this.exitCode=exitCode;
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

      this.displays = [];
      this.exitCode = 0;
      app = this;
   }

   on_applet_added_to_panel() {
      Util.spawnCommandLineAsyncIO( "ddcutil detect", Lang.bind(this, this._readDisplays) );
      // Add a "detecting" menu item in case the detecting phase take a long time when using pre version 2.0 ddcutil
      let item = new PopupMenu.PopupIconMenuItem(_("Detecting monitors..."), "video-display-symbolic", St.IconType.SYMBOLIC);
      item.actor.set_reactive(false);
      this.menu.addMenuItem(item);
      // An attempt to detect monitor changes (doesn't work the way I need)
      //this._signalManager.connect(Main.layoutManager, "monitors-changed", this._monitorsChanged, this);
   }

   on_applet_clicked() {
     this.menu.toggle();
   }

   //_monitorsChanged() {
   //   log( "Monitors changed!" );
      //Util.spawnCommandLineAsyncIO( "ddcutil detect", Lang.bind(this, this._readDisplays) );
   //}

   // Call back routine that gets the output for "ddcutil detect"
   _readDisplays(stdout, stderr, exitCode) {
      if (exitCode===0) {
         // Read the stdout lines looking for "Display #"
         let lines = stdout.split('\n');
         for (const i in lines) {
            if (lines[i].startsWith("Display ")) {
               let displayNumber = parseInt(lines[i].charAt(8));
               this.displays.push( {number: displayNumber, name: "", currentInput: -1, inputs: [], inputNames: [], menuItems: []} );
               Util.spawnCommandLineAsyncIO( "ddcutil -d " + displayNumber + " capabilities", Lang.bind(this.displays[this.displays.length-1], readInputs) );
            }
         }
         if (this.displays.length === 0) {
            this.updateMenu(); // Show no monitors were found in the menu
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
            item = new PopupMenu.PopupIconMenuItem(this.displays[i].name, "video-display-symbolic", St.IconType.SYMBOLIC);
            item.actor.set_reactive(false);
            this.menu.addMenuItem(item);
            if (i!=0) {
               // Add a separator
               this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
            for (let idx=0 ; idx < this.displays[i].inputNames.length ; idx++ ) {
               item = new PopupMenu.PopupMenuItem("\t" + this.displays[i].inputNames[idx] );
               if (this.displays[i].currentInput===this.displays[i].inputs[idx]) {
                  //item.setShowDot(true);
               }
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
            // Add a "detecting" menu item in case the detecting phase take a long time when using pre version 2.0 ddcutil
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
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

let app = null;

function readInputs(stdout, stderr, exitCode) {
   log( `Looking for inputs for display ${this.number} ec:${exitCode} ...` );
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
            Util.spawnCommandLineAsyncIO( "ddcutil -d " + this.number + " getvcp 60", Lang.bind(this, readCurrentInput) );
            break;
         }
      }
      //log( `Display ${this.number} ${this.name}` );
      //log( `Inputs found: ${this.inputs}` );
      //log( `Input names: ${this.inputNames}` );
      app.updateMenu();
   } else {
      // ddcutil returned an error code
   }
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
      app = this;
   }

   on_applet_added_to_panel() {
      log( "on_applet_added_to_panel" );
      Util.spawnCommandLineAsyncIO( "ddcutil detect", Lang.bind(this, this._readDisplays) );
      this._signalManager.connect(Main.layoutManager, "monitors-changed", this._monitorsChanged, this);
   }

   on_applet_clicked() {
     this.menu.toggle();
   }

   _monitorsChanged() {
      log( "Monitors changed!" );
      //Util.spawnCommandLineAsyncIO( "ddcutil detect", Lang.bind(this, this._readDisplays) );
   }

   // Call back routine that gets the output for "ddcutil detect"
   _readDisplays(stdout, stderr, exitCode) {
      if (exitCode===0) {
         // Read the stdout lines looking for "Display #"
         let lines = stdout.split('\n');
         for (const i in lines) {
            //log( `line: ${lines[i]}` );
            if (lines[i].startsWith("Display ")) {
               let displayNumber = parseInt(lines[i].charAt(8));
               this.displays.push( {number: displayNumber, name: "", currentInput: -1, inputs: [], inputNames: [], menuItems: []} );
               Util.spawnCommandLineAsyncIO( "ddcutil -d " + displayNumber + " capabilities", Lang.bind(this.displays[this.displays.length-1], readInputs) );
            }
         }
      } else {
         // ddcutil returned an error code
      }
   }

   updateMenu() {
      let item;
      this.menu.removeAll();
      log( `updating menu for ${this.displays.length} displays` );
      for (let i=0 ; i< this.displays.length ; i++) {
         item = new PopupMenu.PopupIconMenuItem(this.displays[i].name, "video-display-symbolic", St.IconType.SYMBOLIC);
         item.actor.set_reactive(false);
//         item.setInse
         this.menu.addMenuItem(item);
         if (i!=0) {
            // Add a separator title
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
         }
         for (let idx=0 ; idx < this.displays[i].inputNames.length ; idx++ ) {
            item = new PopupMenu.PopupMenuItem("\t" + this.displays[i].inputNames[idx] );
            if (this.displays[i].currentInput===this.displays[i].inputs[idx]) {
               //item.setShowDot(true);
            }
            this.displays[i].menuItems.push(item);
            item.connect("activate", Lang.bind(this, function(/*menuitem, state*/)
               {
                  //log( `menu item toggled! ${state}, ${i}, ${idx}` );
                  log( "clicked" );
                  //if (state) {
                     Util.spawnCommandLine( "ddcutil -d " + this.displays[i].number + " setvcp 60 0x" + this.displays[i].inputs[idx].toString(16));
                     for (let ii=0 ; ii < this.displays[i].inputs.length ; ii++) {
                        //this.displays[i].menuItems[ii].setShowDot((ii === idx));
                     }
                  //} else {
                     // You can't toggle off
                  //   log( `setting menu switch to true for ${idx}` );
                  //   this.displays[i].menuItems[idx].setShowDot(true);
                  //}
               }));
            this.menu.addMenuItem(item);
         }
      }
   }
}

// Called by cinnamon when starting this applet
function main(metadata, orientation, panelHeight, instanceId) {
  return new InputSourceApp(orientation, panelHeight, instanceId);
}
<p align="center"><img width="100" height="100" src="https://i.imgur.com/LJjnN1r.png"></p>

<h1 align="center">flowabot</h1>

**flowabot** is a modular discord bot with a focus on osu! features. Instead of me explaining this with words, I'll just leave a demonstration video:

<p align="center"><a target="_blank" href="https://streamable.com/12ybd"><img height="350px" src="https://i.imgur.com/oixZ9tK.png"></img></a></p>

***Jump to [Installation](#Installation).***

<h2 align="center">Main Features</h2>

<h3 align="center">Fancy scorecards with unique information like a difficulty graph or unstable rate</h3>

<p align="center"><img src="https://i.imgur.com/WoJ4Dve.png"></img></p>

<h3 align="center">Get an overview of your osu! stats</h3>

<p align="center"><img src="https://i.imgur.com/wixlCi9.png"></img></p>

<h3 align="center">Render a video or picture of any osu! beatmap</h3>

<p align="center"><img src="https://i.imgur.com/d3FlFMD.gif"></img></p>

<h3 align="center">Get a graph with the hardest parts of a beatmap</h3>

<p align="center"><img src="https://i.imgur.com/C2dDkA5.png"></img></p>

<h3 align="center">Get a graph of the bpm changes throughout a beatmap</h3>

<p align="center"><img src="https://i.imgur.com/RaqLCL5.png"></img></p>

<h4 align="center">You can find more features in the <a href="COMMANDS.md">commands list</a>.</h4>

<h2 id="Installation" align="center">Installation</h2>

### Prerequisites

- **Using Linux or macOS is recommended**
- Git (https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- Node.js 10 or higher (https://nodejs.org/download/)
- node-gyp (https://github.com/nodejs/node-gyp#installation)
- Be sure to have gcc/g++ installed, e.g. `sudo apt install build-essential` on Ubuntu
- Discord bot token and client ID (https://discordapp.com/developers/applications/)
- osu!api key (https://osu.ppy.sh/p/api/)
- node-canvas dependencies (https://github.com/Automattic/node-canvas#compiling)

### Setup

**Clone the repo and enter the bot directory**

    git clone https://github.com/LeaPhant/flowabot.git
    cd flowabot

---
**Install all modules**

    npm i

*During this process you will be asked to agree to the Highcharts license terms. Type `y` and press enter, for all the other options you can just keep pressing enter to disable these features.*

---

**Now you'll be able to use the configuration wizard.**

    npm run config
    
*Follow the on-screen instructions, just press enter without typing anything for features you don't need.*

---

**You should be able to run the bot now.**

    npm start
    
*If you provided a Discord client ID during the configuration you will receive an invite link to add the bot to your server.*

---

**Make the grade emojis work (S rank, A rank, etc.)**

    npm run emojis
    
*This script will automatically upload the grade emojis to a server you'll have to pick. If there are no free emoji slots create a new server just for the bot to use its emojis from.*

---

**To keep the bot running in the background [install pm2](http://pm2.keymetrics.io/docs/usage/quick-start/) and run**

    pm2 start npm --name flowabot -- start
    
**To start the bot on system boot use**

    pm2 save
    pm2 startup
    
*(This is only tested on Linux)*

<h2 align="center">Patrons</h2>

Thanks to anyone supporting me on [Patreon](https://www.patreon.com/LeaPhant), especialy the following peeps who decided to leave $5 or more per month 😳 

**WitchOfFrost**

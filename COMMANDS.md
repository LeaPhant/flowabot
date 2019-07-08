# Commands
### Table of contents
- [!addpp](#addpp)
- [!ar](#ar)
- [!bmi](#bmi)
- [!bpm](#bpm)
- [!compare](#compare)
- [!emojipedia](#emojipedia)
- [!emote](#emote)
- [!eval](#eval)
- [!fantasychange](#fantasychange)
- [!fantasyname](#fantasyname)
- [!ffz](#ffz)
- [!flowa](#flowa)
- [!flowabot](#flowabot)
- [!help](#help)
- [!ign-set](#ign-set)
- [!lastfm](#lastfm)
- [!np](#np)
- [!osu-track](#osu-track)
- [!osu-untrack](#osu-untrack)
- [!osu](#osu)
- [!ping](#ping)
- [!pp](#pp)
- [!recent](#recent)
- [!render](#render)
- [!score](#score)
- [!strains](#strains)
- [!top](#top)
- [!uptime](#uptime)
- [!viewers](#viewers)
- [!with](#with)
---
## !addpp
Calculate new total pp after achieving a certain top play.

**Usage**: `!addpp <amounts separated by +> [username] [beatmap_id]`
### Examples:

    !addpp 300
Returns your total pp with an additional 300pp score.

    !addpp 300+350
Returns your total pp with an additional 300 and 350pp score.

    !addpp 1100 Vaxei 1860433
Returns Vaxei's total pp if their score on /b/1860433 awarded 1100pp.
## !ar
Calculate Approach Rate values and miliseconds with mods applied.

**Usage**: `!ar <ar> [+mods]`
### Example:

    !ar 8 +DT
Returns AR of AR8 with DT applied.
## !bmi
Calculate your BMI.

**Usage**: `!bmi <height in m or cm> <weight in kg>`
### Examples:

    !bmi 185cm 70kg
undefined

    !bmi 1.56m 56kg
undefined
## !bpm
Show a visual BPM graph over time for a beatmap.

**Usage**: `!bpm [beatmap url] [+mods]`
### Examples:

    !bpm
Returns BPM graph for the last beatmap.

    !bpm https://osu.ppy.sh/b/75 +DT
Returns BPM graph with DT for specific beatmap.
## !compare
Search for best score on the last beatmap.

**Variations**: `!compare`, `!c`

**Usage**: `!compare [username or * for all users] [+mods]`
### Examples:

    !compare
Returns your own best score on the last beatmap.

    !compare Vaxei +mods
Returns Vaxei's best score with the same mods on the last beatmap.

    !compare * +HD
Returns the #1 HD score on the last beatmap.
## !emojipedia
Look up what an emoji looks like on all platforms (warning: spammy).

**Usage**: `!emojipedia <emoji>`
### Example:

    !emojipedia 🤔
Returns thinking emoji on all platforms.
## !emote
Print one or multiple emotes the bot can use in chat.

**Variations**: `!emote`, `!e`

**Usage**: `!emote <emote 1> [emote 2] [emote n]`
### Example:

    !e SourPls
Returns SourPls emote.
## !eval
Runs JavaScript code and returns the result of the last evaluation. Underscore.js for array/object helpers and `bonusPP(n)` for bonus pp calculation are available.

**Usage**: `!eval [javascript code]`
### Examples:

    !eval 5+5
Evaluates 5+5 and returns the result.

    !eval _max.([1, 2, 3])
Uses Underscore.js to return the maximum value of an array.
## !fantasychange
Generates a fantasy name and changes your nickname to it.,Available types: `human`, `elf`, `dwarf`, `hobbit`, `barbarian`, `orc`, `evil`, `asian`, `arabic`, `surname`, `sci-fi`, `lovecraft`, `reptilian`, `aztec`, `ratman`, `demon`, `dragon`, `wizard`, `mixed`, `english`, `place`, `title`, `military`, `hero/villain`, `rockband`,Available lengths: `short`, `medium`, `long`,Data from <https://www.fantasynamegen.com/>.

**Usage**: `!fantasychange <type> [length]`
### Example:

    !fantasychange elf medium
Generates a medium-length elf name and sets it as your nickname.
## !fantasyname
Generates a fantasy name.,Available types: `human`, `elf`, `dwarf`, `hobbit`, `barbarian`, `orc`, `evil`, `asian`, `arabic`, `surname`, `sci-fi`, `lovecraft`, `reptilian`, `aztec`, `ratman`, `demon`, `dragon`, `wizard`, `mixed`, `english`, `place`, `title`, `military`, `hero/villain`, `rockband`,Available lengths: `short`, `medium`, `long`,Data from <https://www.fantasynamegen.com/>.

**Usage**: `!fantasyname <type> [length]`
### Example:

    !fantasyname elf medium
Returns a medium-length elf name.
## !ffz
Show an FFZ emote by name. Emotes from <https://frankerfacez.com/>.

**Usage**: `!ffz <emote name>`
### Example:

    !ffz WoweeW
Returns WoweeW FFZ emote
## !flowa
Show a random flower picture. Images from <https://pexels.com/>.

**Usage**: `!flowa [optional tags separated by space]`
### Example:

    !flowa sakura tree
Returns a random picture of a sakura tree.
## !flowabot
Show information about this bot.

**Usage**: `!flowabot`
## !help
Get help for a command.

**Usage**: `!help <command>`
### Example:

    !help pp
Returns help on how to use the `!pp` command.
## !ign-set
Sets your osu! username so you can use osu! commands without specifying a username.

**Usage**: `!ign-set <osu! username>`
### Example:

    !ign-set nathan on osu
Sets your osu! username to nathan on osu.
## !lastfm
Show Last.fm stats for a user.

**Usage**: `!lastfm <last.fm username> [period (7day, 1month, 3month, 6month, 12month, overall)]`
### Example:

    !lastfm rj overall
Returns total last.fm stats for rj.
## !np
Shows what song you are currently listening to. If it can't be retrieved from Rich Presence it will ask for a Last.fm username.

**Usage**: `!np [last.fm username]`
## !osu-track
Start tracking the specified user's osu! top plays in the current channel.

**Usage**: `!osu-track <username> [top play limit (1-100, default 50)]`
### Example:

    !osu-track nathan_on_osu 50
Start tracking nathan on osu's top 50 top plays.
## !osu-untrack
Stop tracking the specified user's osu! top plays in the current channel.

**Usage**: `!osu-untrack <username> [top play limit (1-100, default 50)]`
### Example:

    !osu-untrack nathan_on_osu
Stop tracking nathan on osu's top plays.
## !osu
Show osu! stats.

**Usage**: `!osu [username]`
### Example:

    !osu nathan_on_osu
Returns nathan on osu's osu! stats.
## !ping

**Usage**: `!ping`
## !pp
Uses osu-tools to calculate pp for a beatmap.

**Usage**: `!pp <map link> [+HDDT] [99.23%] [2x100] [1x50] [3m] [342x] [OD9.5] [AR10.3] [CS6]`
### Example:

    !pp https://osu.ppy.sh/b/75 +HD 4x100 343x CS2
Calculates pp on this beatmap with HD applied, 4 100s, 343 Combo and CS set to 2.
## !recent
Show recent score or pass.

**Variations**: `!recent`, `!rs`, `!recentpass`, `!rp`

**Usage**: `!recent [username]`
### Examples:

    !recent nathan_on_osu
Returns nathan on osu's most recent score.

    !recent3 respektive
Returns respektive's most recent score.

    !recentpass
Returns your most recent pass.
## !render
Render picture or gif of a beatmap at a specific time.

**Variations**: `!render`, `!frame`, `!fail`

**Usage**: `!render [beatmap url] [+mods] [AR8] [CS6] [strains/aim/speed/fail] [mp4] [audio] [120fps] [mm:ss] [4s]`
### Examples:

    !render strains
Returns a gif of the hardest part on the last beatmap.

    !fail
Returns a gif of the part where the player failed on the last beatmap.

    !render 1:05
Returns an image of the last beatmap at 1 minute and 5 seconds.

    !render speed 10s audio
Returns a 10 second video with sound of the streamiest part on the last beatmap.

    !render strains 120fps
Returns a 120fps video of the hardest part on the last beatmap.
## !score
Search for a score on a beatmap.

**Usage**: `!score <beatmap url> [username or * for any user] [+mods]`
### Examples:

    !score https://osu.ppy.sh/b/75 * +HD
Returns #1 score with HD on this beatmap.

    !score https://osu.ppy.sh/b/75
Returns your best score on this beatmap.

    !score5 https://osu.ppy.sh/b/75 *
Returns the #5 score on this beatmap.
## !strains
Show a visual strain graph of the star raiting over time on a beatmap.

**Usage**: `!strains [beatmap url] [+mods] [AR8] [CS6] [aim/speed]`
### Examples:

    !strains
Returns strain graph for the last beatmap.

    !strains +HR CS5
Returns strain graph with HR applied and CS set to 5 for the last beatmap.

    !strains https://osu.ppy.sh/b/75 aim
Returns aim strain graph for this beatmap.
## !top
Show a specific top play.

**Variations**: `!top`, `!rb`, `!recentbest`, `!ob`, `!oldbest`

**Usage**: `!top [username]`
### Examples:

    !top
Returns your #1 top play.

    !top5 vaxei
Returns Vaxei's #5 top play.

    !rb
Returns your most recent top play.

    !ob
Returns your oldest top play (from your top 100).
## !uptime
See how for long a Twitch channel has been live or for how long it hasn't been streaming.

**Variations**: `!uptime`, `!downtime`

**Usage**: `!uptime <twitch username>`
### Examples:

    !uptime distortion2
Returns distortion2's uptime or downtime.

    !downtime ninja
Returns ninja's uptime or downtime.
## !viewers
See how many people are watching a Twitch channel.

**Usage**: `!viewers <twitch username>`
### Example:

    !viewers distortion2
Returns how many viewers distortion2 currently has (if they're live).
## !with
Show pp values of a beatmap with several accuracies or a specified accuracy.

**Usage**: `!with [+mods] [98.34%]`
### Examples:

    !with
Returns pp values for the last beatmap with the same mods.

    !with +
Returns pp values for the last beatmap without mods.

    !with +HD 97.5%
Returns pp value for the last beatmap with 97.5% accuracy and HD applied.
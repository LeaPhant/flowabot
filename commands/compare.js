const osu = require('../osu.js');
const helper = require('../helper.js');

async function getBeatmapIdFromMessage(msg) {
    if (msg.reference) {
        const replied_msg = await msg.channel.messages.fetch(msg.reference.messageID)
        const beatmap_id = osu.parse_beatmap_url(replied_msg.embeds[0].url)
        return beatmap_id
    } else {
        return
    }
}

module.exports = {
    command: ['compare', 'c'],
    description: "Search for best score on the last beatmap.",
    usage: '[username or * for all users] [+mods]',
    example: [
        {
            run: "compare",
            result: "Returns your own best score on the last beatmap."
        },
        {
            run: "compare Vaxei +mods",
            result: "Returns Vaxei's best score with the same mods on the last beatmap."
        },
        {
            run: "compare * +HD",
            result: "Returns the #1 HD score on the last beatmap."
        }
    ],
    configRequired: ["credentials.client_id", "credentials.client_secret"],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let compare_user = helper.getUsername(argv, msg, user_ign);

            getBeatmapIdFromMessage(msg).then((beatmap_id) => {
                let compare_beatmap = beatmap_id;

                if(!(msg.channel.id in last_beatmap)){
                    reject('No recent score to compare to found. 💀');
                    return false;
                }
                if(!compare_beatmap){
                    compare_beatmap = last_beatmap[msg.channel.id].beatmap_id;
                }
    
                let compare_mods;
    
                argv.slice(1).forEach(arg => {
                    if(arg.startsWith('+')){
                        if(arg.startsWith('+mods'))
                            compare_mods = ['mods', ...last_beatmap[msg.channel.id].mods];
                        else
                            compare_mods = arg.toUpperCase().substr(1).match(/.{1,2}/g);
                    }
                    if(arg == '*')
                        compare_user = '*';
                });
    
                if(!compare_user){
                    if(user_ign[msg.author.id] == undefined)
                        reject(helper.commandHelp('ign-set'));
                    else
                        reject(helper.commandHelp('compare'));
                    return false;
                }else{
                    let options = {
                        beatmap_id: compare_beatmap,
                        mods: compare_mods
                    };
    
                    if(compare_user != '*')
                        options.user = compare_user;
                    else if(compare_mods)
                        compare_mods.splice(1, 0);
    
                    options.index = 1;
    
                    osu.get_score(options, (err, recent, strains_bar, ur_promise) => {
                        if(err){
                            helper.error(err);
                            reject(err);
                        }else{
                            let embed = osu.format_embed(recent);
                            helper.updateLastBeatmap(recent, msg.channel.id, last_beatmap);
    
                            if(ur_promise){
                                resolve({
                                    embeds: [embed],
                                    files: [{attachment: strains_bar, name: 'strains_bar.png'}],
                                    edit_promise: new Promise((resolve, reject) => {
                                        ur_promise.then(recent => {
                                            embed = osu.format_embed(recent);
                                            resolve({ embeds: [embed] });
                                        });
                                    })});
                            }else{
                                resolve({
                                    embeds: [embed],
                                    files: [{attachment: strains_bar, name: 'strains_bar.png'}]
                                });
                            }
                        }
                    });
                }
            })

        });
    }
};

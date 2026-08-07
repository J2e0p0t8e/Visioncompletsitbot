import 'dotenv/config';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const TARGET_USERNAMES = [
    'tesan01', 'adoree0622', 'msossou57_49275', 
    'ricardo20046f', 'elie0785_67957', 'ryan0678p', 
    'mariano015119', 'jayeahf_79219', 'ecksoner'
];

async function main() {
    if (!TOKEN || !GUILD_ID) {
        console.error("TOKEN or GUILD_ID is missing.");
        process.exit(1);
    }

    try {
        console.log("Fetching guild members...");
        const users = [];
        for (const username of TARGET_USERNAMES) {
            const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${username}`, {
                headers: { 'Authorization': `Bot ${TOKEN}` }
            });
            const data = await res.json();
            if (res.ok && data.length > 0) {
                const member = data.find(m => m.user.username.toLowerCase() === username.toLowerCase());
                if (member) {
                    users.push({
                        id: member.user.id,
                        username: member.user.username,
                        displayName: member.nick || member.user.global_name || member.user.username
                    });
                } else {
                    console.log(`Could not find exact match for ${username}`);
                }
            } else {
                console.log(`Failed to fetch for ${username}`);
            }
        }

        for (const user of users) {
            console.log(`Getting DM channel for ${user.username}...`);
            const channelRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
                method: 'POST',
                headers: { 'Authorization': `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient_id: user.id })
            });

            const channelData = await channelRes.json();
            if (!channelRes.ok) continue;

            console.log(`Sending message to ${user.username} as ${user.displayName}...`);

            const embed = {
                title: "🛡️ Mise à jour de ton rôle Vision+",
                description: `Bonjour **${user.displayName}**,\n\nPetit message automatique (mais plein de bienveillance !) de la part de l'équipe Vision+. 🤖\n\nComme la communauté a besoin d'une présence régulière pour être bien animée, et qu'on a vu que tu avais un emploi du temps très chargé récemment, on va temporairement te retirer le rôle de **Capitaine / Co-capitaine**.\n\nIl n'y a aucun souci avec ça, la vraie vie passe avant tout ! Repose-toi bien, gère tes priorités, et n'hésite pas à nous faire signe quand tu seras de retour en pleine forme.`,
                color: 14842953, // Un jaune/orange chaleureux
                footer: {
                    text: "L'équipe fondatrice de Vision+"
                },
                timestamp: new Date().toISOString()
            };

            const messageRes = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    content: `Coucou **${user.displayName}**, un petit message pour toi :`,
                    embeds: [embed] 
                })
            });

            if (messageRes.ok) {
                console.log(`Successfully sent embed to ${user.username}`);
            } else {
                const messageError = await messageRes.json();
                console.error(`Failed to send to ${user.username}:`, JSON.stringify(messageError, null, 2));
            }
        }
    } catch (err) {
        console.error("An error occurred:", err);
    }
}

main();

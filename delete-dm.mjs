import 'dotenv/config';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const TARGET_USERNAMES = ['jayeahf_79219', 'ecksoner'];

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
                if (member) users.push(member.user);
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

            console.log(`Fetching recent messages in DM with ${user.username}...`);
            const messagesRes = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages?limit=10`, {
                headers: { 'Authorization': `Bot ${TOKEN}` }
            });

            if (messagesRes.ok) {
                const messages = await messagesRes.json();
                // Find messages containing the technical note string
                const targetMessages = messages.filter(m => m.content.includes("Petite note technique"));
                
                for (const msg of targetMessages) {
                    console.log(`Deleting message ${msg.id} for ${user.username}...`);
                    const deleteRes = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages/${msg.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bot ${TOKEN}` }
                    });
                    if (deleteRes.ok) {
                        console.log(`Deleted successfully!`);
                    } else {
                        console.error(`Failed to delete message:`, await deleteRes.json());
                    }
                }
            }
        }
    } catch (err) {
        console.error("An error occurred:", err);
    }
}

main();

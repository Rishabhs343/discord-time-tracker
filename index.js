require('dotenv').config();
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const TOKEN = process.env.BOT_TOKEN; // Replace with your bot token
const DATA_FILE = './timeData.json';
const ADMIN_ROLE = 'Admin'; // Admin role name
const TIME_TRACKING_CHANNEL = 'time-tracking'; // Channel name or ID (case-sensitive)

let timeData = {};
if (fs.existsSync(DATA_FILE)) {
    timeData = JSON.parse(fs.readFileSync(DATA_FILE));
}

// Function to build work summary embed
function buildWorkSummary(username, date, day, userData) {
    const breaks = userData.breaks.map((b, i) => {
        return b.end
            ? `Break ${i + 1}: ${new Date(b.start).toLocaleTimeString()} - ${new Date(b.end).toLocaleTimeString()}`
            : `Break ${i + 1}: ${new Date(b.start).toLocaleTimeString()} - Ongoing`;
    }).join('\n');

    return new EmbedBuilder()
        .setColor('#333333')
        .setTitle('Daily Work Summary')
        .setDescription('Here is your work summary for the specified date:')
        .addFields(
            { name: 'User', value: username, inline: true },
            { name: 'Date', value: date, inline: true },
            { name: 'Day', value: day, inline: true },
            { name: 'Started At', value: userData.start ? new Date(userData.start).toLocaleTimeString() : 'N/A', inline: false },
            { name: 'Breaks', value: breaks || 'No breaks', inline: false },
            { name: 'Ended At', value: userData.end ? new Date(userData.end).toLocaleTimeString() : 'N/A', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Work Log Bot' });
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isButton()) return;

    // Check if interaction is in the "time-tracking" channel
    const channelName = interaction.channel.name;
    if (channelName !== TIME_TRACKING_CHANNEL) {
        await interaction.reply({
            content: `This command can only be used in the **${TIME_TRACKING_CHANNEL}** channel!`,
            ephemeral: true
        });
        console.log(`Blocked interaction from ${interaction.user.username} in channel ${channelName}`);
        return;
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const day = new Date().toLocaleString('en-US', { weekday: 'long' });

    // Initialize user data
    if (!timeData[userId]) timeData[userId] = {};
    if (!timeData[userId][date]) timeData[userId][date] = {
        start: null,
        breaks: [],
        end: null,
        state: 'not_started',
        summaryMessageId: null
    };

    // Handle slash commands
    if (interaction.isCommand()) {
        if (interaction.commandName === 'startwork') {
            if (timeData[userId][date].state !== 'not_started') {
                await interaction.reply({ content: 'You already started work today! Use /resumework to continue.', ephemeral: true });
                return;
            }

            timeData[userId][date].start = new Date().toISOString();
            timeData[userId][date].state = 'started';
            fs.writeFileSync(DATA_FILE, JSON.stringify(timeData, null, 2));

            const startButton = new ButtonBuilder()
                .setCustomId('break')
                .setLabel('Start Break')
                .setStyle(ButtonStyle.Primary);
            const endButton = new ButtonBuilder()
                .setCustomId('end')
                .setLabel('End Work')
                .setStyle(ButtonStyle.Danger);
            const row = new ActionRowBuilder().addComponents(startButton, endButton);

            try {
                await interaction.reply({
                    content: `Work started for ${username} at ${new Date(timeData[userId][date].start).toLocaleTimeString()}!`,
                    components: [row],
                    ephemeral: false
                });
                console.log(`Start message sent for ${username} in channel ${interaction.channel.id}`);
            } catch (error) {
                console.error('Error sending start message:', error);
                await interaction.reply({ content: 'Failed to start work session. Check bot permissions!', ephemeral: true });
            }
        }

        if (interaction.commandName === 'resumework') {
            if (!timeData[userId][date] || timeData[userId][date].state === 'not_started') {
                await interaction.reply({ content: 'You haven\'t started work today! Use /startwork to begin.', ephemeral: true });
                return;
            }
            if (timeData[userId][date].state === 'ended') {
                await interaction.reply({ content: 'Your work session has ended for today. Start a new one with /startwork.', ephemeral: true });
                return;
            }

            const startButton = new ButtonBuilder()
                .setCustomId('break')
                .setLabel('Start Break')
                .setStyle(ButtonStyle.Primary);
            const endButton = new ButtonBuilder()
                .setCustomId('end')
                .setLabel('End Work')
                .setStyle(ButtonStyle.Danger);
            const breakEndButton = new ButtonBuilder()
                .setCustomId('break_end')
                .setLabel('End Break')
                .setStyle(ButtonStyle.Success);
            const row = timeData[userId][date].state === 'started'
                ? new ActionRowBuilder().addComponents(startButton, endButton)
                : new ActionRowBuilder().addComponents(breakEndButton);

            try {
                await interaction.reply({
                    content: `Resuming session for ${username}! Current state: ${timeData[userId][date].state === 'started' ? 'Work started' : 'On break'}`,
                    components: [row],
                    ephemeral: false
                });
                console.log(`Resume message sent for ${username} in channel ${interaction.channel.id}`);
            } catch (error) {
                console.error('Error sending resume message:', error);
                await interaction.reply({ content: 'Failed to resume session. Check bot permissions!', ephemeral: true });
            }
        }

        if (interaction.commandName === 'viewworklog') {
            const targetDate = interaction.options.getString('date') || date;
            if (!timeData[userId] || !timeData[userId][targetDate]) {
                await interaction.reply({ content: `No work log found for ${targetDate}!`, ephemeral: true });
                return;
            }

            const userData = timeData[userId][targetDate];
            const targetDay = new Date(targetDate).toLocaleString('en-US', { weekday: 'long' });
            const embed = buildWorkSummary(username, targetDate, targetDay, userData);

            try {
                await interaction.reply({
                    content: `Work log for ${username} on ${targetDate}:`,
                    embeds: [embed],
                    ephemeral: false
                });
                console.log(`Work log sent for ${username} on ${targetDate} in channel ${interaction.channel.id}`);
            } catch (error) {
                console.error('Error sending work log:', error);
                await interaction.reply({ content: 'Failed to show work log. Check bot permissions!', ephemeral: true });
            }
        }

        if (interaction.commandName === 'deletework') {
            if (!interaction.member.roles.cache.some(role => role.name === ADMIN_ROLE)) {
                await interaction.reply({ content: 'Only admins can use this command!', ephemeral: true });
                return;
            }

            const targetUser = interaction.options.getUser('user');
            const targetDate = interaction.options.getString('date');
            if (!timeData[targetUser.id] || !timeData[targetUser.id][targetDate]) {
                await interaction.reply({ content: 'No work data found for this user on this date!', ephemeral: true });
                return;
            }

            delete timeData[targetUser.id][targetDate];
            fs.writeFileSync(DATA_FILE, JSON.stringify(timeData, null, 2));
            await interaction.reply({ content: `Work data for ${targetUser.username} on ${targetDate} has been deleted!`, ephemeral: true });
        }

        if (interaction.commandName === 'modifywork') {
            if (!interaction.member.roles.cache.some(role => role.name === ADMIN_ROLE)) {
                await interaction.reply({ content: 'Only admins can use this command!', ephemeral: true });
                return;
            }

            const targetUser = interaction.options.getUser('user');
            const targetDate = interaction.options.getString('date');
            const field = interaction.options.getString('field');
            let value = interaction.options.getString('value');

            if (!timeData[targetUser.id] || !timeData[targetUser.id][targetDate]) {
                await interaction.reply({ content: 'No work data found for this user on this date!', ephemeral: true });
                return;
            }

            if (/^\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?$/i.test(value)) {
                const datePart = targetDate;
                const timePart = value.toUpperCase().replace(/\s+/g, '');
                const d = new Date(`${datePart}T00:00:00`);
                let [h, m, s] = [0, 0, 0];
                let match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s?(am|pm)?$/i);
                if (match) {
                    h = parseInt(match[1]);
                    m = parseInt(match[2]);
                    s = match[3] ? parseInt(match[3]) : 0;
                    if (match[4]) {
                        if (match[4].toLowerCase() === 'pm' && h < 12) h += 12;
                        if (match[4].toLowerCase() === 'am' && h === 12) h = 0;
                    }
                }
                d.setHours(h, m, s, 0);
                value = d.toISOString();
            } else {
                const d = new Date(value);
                if (isNaN(d.getTime())) {
                    await interaction.reply({ content: 'Invalid date/time format! Please use YYYY-MM-DDTHH:mm:ssZ or a valid time (e.g., 2:28:40 am).', ephemeral: true });
                    return;
                }
                value = d.toISOString();
            }

            const userData = timeData[targetUser.id][targetDate];
            if (field === 'start') {
                userData.start = value;
            } else if (field === 'end') {
                userData.end = value;
                userData.state = 'ended';
            } else if (field.startsWith('break')) {
                const breakIndex = parseInt(field.split('-')[1]) - 1;
                if (breakIndex >= userData.breaks.length) {
                    await interaction.reply({ content: 'Invalid break number!', ephemeral: true });
                    return;
                }
                const breakField = field.split('-')[2];
                userData.breaks[breakIndex][breakField] = value;
            } else {
                await interaction.reply({ content: 'Invalid field! Use "start", "end", or "break-X-start/end" (e.g., break-1-start)', ephemeral: true });
                return;
            }

            fs.writeFileSync(DATA_FILE, JSON.stringify(timeData, null, 2));
            const breaks = userData.breaks.map((b, i) => {
                return b.end
                    ? `Break ${i + 1}: ${new Date(b.start).toLocaleTimeString()} - ${new Date(b.end).toLocaleTimeString()}`
                    : `Break ${i + 1}: ${new Date(b.start).toLocaleTimeString()} - Ongoing`;
            }).join('\n');
            const embed = new EmbedBuilder()
                .setColor('#00cc99')
                .setTitle('Updated Work Data')
                .addFields(
                    { name: 'Name', value: targetUser.displayName || targetUser.username, inline: true },
                    { name: 'Date', value: targetDate, inline: true },
                    { name: 'Started At', value: userData.start ? new Date(userData.start).toLocaleTimeString() : 'N/A', inline: false },
                    { name: 'Breaks', value: breaks || 'No breaks taken', inline: false },
                    { name: 'Ended At', value: userData.end ? new Date(userData.end).toLocaleTimeString() : 'N/A', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Work Log Bot' });
            await interaction.reply({ content: `Updated ${field} for ${targetUser.username} on ${targetDate} to ${value}!`, embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'showwork') {
            if (!interaction.member.roles.cache.some(role => role.name === ADMIN_ROLE)) {
                await interaction.reply({ content: 'Only admins can use this command!', ephemeral: true });
                return;
            }
            const targetUser = interaction.options.getUser('user');
            const targetDate = interaction.options.getString('date');
            if (!timeData[targetUser.id] || !timeData[targetUser.id][targetDate]) {
                await interaction.reply({ content: 'No work data found for this user on this date!', ephemeral: true });
                return;
            }
            const userData = timeData[targetUser.id][targetDate];
            const breaks = userData.breaks.map((b, i) => {
                return b.end
                    ? `Break ${i + 1}: ${new Date(b.start).toLocaleTimeString()} - ${new Date(b.end).toLocaleTimeString()}`
                    : `Break ${i + 1}: ${new Date(b.start).toLocaleTimeString()} - Ongoing`;
            }).join('\n');
            const embed = new EmbedBuilder()
                .setColor('#00cc99')
                .setTitle('Work Data')
                .addFields(
                    { name: 'Name', value: targetUser.displayName || targetUser.username, inline: true },
                    { name: 'Date', value: targetDate, inline: true },
                    { name: 'Started At', value: userData.start ? new Date(userData.start).toLocaleTimeString() : 'N/A', inline: false },
                    { name: 'Breaks', value: breaks || 'No breaks taken', inline: false },
                    { name: 'Ended At', value: userData.end ? new Date(userData.end).toLocaleTimeString() : 'N/A', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Work Log Bot' });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // Handle button interactions
    if (interaction.isButton()) {
        if (interaction.customId === 'break') {
            timeData[userId][date].breaks.push({ start: new Date().toISOString(), end: null });
            timeData[userId][date].state = 'on_break';
            fs.writeFileSync(DATA_FILE, JSON.stringify(timeData, null, 2));

            const breakEndButton = new ButtonBuilder()
                .setCustomId('break_end')
                .setLabel('End Break')
                .setStyle(ButtonStyle.Success);
            const row = new ActionRowBuilder().addComponents(breakEndButton);

            try {
                await interaction.reply({
                    content: `Break started for ${username} at ${new Date(timeData[userId][date].breaks[timeData[userId][date].breaks.length - 1].start).toLocaleTimeString()}!`,
                    components: [row],
                    ephemeral: false
                });
                console.log(`Break start message sent for ${username} in channel ${interaction.channel.id}`);
            } catch (error) {
                console.error('Error sending break start message:', error);
                await interaction.reply({ content: 'Failed to log break start. Check bot permissions!', ephemeral: true });
            }
        }

        if (interaction.customId === 'break_end') {
            timeData[userId][date].breaks[timeData[userId][date].breaks.length - 1].end = new Date().toISOString();
            timeData[userId][date].state = 'started';
            fs.writeFileSync(DATA_FILE, JSON.stringify(timeData, null, 2));

            const startButton = new ButtonBuilder()
                .setCustomId('break')
                .setLabel('Start Break')
                .setStyle(ButtonStyle.Primary);
            const endButton = new ButtonBuilder()
                .setCustomId('end')
                .setLabel('End Work')
                .setStyle(ButtonStyle.Danger);
            const row = new ActionRowBuilder().addComponents(startButton, endButton);

            try {
                await interaction.reply({
                    content: `Break ended for ${username} at ${new Date(timeData[userId][date].breaks[timeData[userId][date].breaks.length - 1].end).toLocaleTimeString()}!`,
                    components: [row],
                    ephemeral: false
                });
                console.log(`Break end message sent for ${username} in channel ${interaction.channel.id}`);
            } catch (error) {
                console.error('Error sending break end message:', error);
                await interaction.reply({ content: 'Failed to log break end. Check bot permissions!', ephemeral: true });
            }
        }

        if (interaction.customId === 'end') {
            if (!timeData[userId][date].start) {
                await interaction.reply({ content: 'You haven\'t started work yet!', ephemeral: true });
                return;
            }

            timeData[userId][date].end = new Date().toISOString();
            timeData[userId][date].state = 'ended';
            fs.writeFileSync(DATA_FILE, JSON.stringify(timeData, null, 2));

            const embed = buildWorkSummary(username, date, day, timeData[userId][date]);

            try {
                const summaryMessage = await interaction.channel.send({
                    content: `Work session ended for ${username}! Here’s the summary:`,
                    embeds: [embed],
                    components: []
                });
                timeData[userId][date].summaryMessageId = summaryMessage.id;
                fs.writeFileSync(DATA_FILE, JSON.stringify(timeData, null, 2));
                console.log(`Summary sent for ${username} in channel ${interaction.channel.id}, message ID: ${summaryMessage.id}`);

                await interaction.reply({
                    content: `Work session ended for ${username}! Summary posted in the channel.`,
                    ephemeral: false
                });
            } catch (error) {
                console.error('Error sending end message or summary:', error);
                await interaction.reply({ content: 'Failed to end work session. Check bot permissions!', ephemeral: true });
            }
        }
    }
});

// Register slash commands
client.on('ready', async () => {
    try {
        await client.application.commands.create({
            name: 'startwork',
            description: 'Start tracking your work time'
        });
        await client.application.commands.create({
            name: 'resumework',
            description: 'Resume your current work session'
        });
        await client.application.commands.create({
            name: 'viewworklog',
            description: 'View your work log for a specific date',
            options: [
                {
                    name: 'date',
                    type: 3,
                    description: 'The date to view (YYYY-MM-DD, default is today)',
                    required: false
                }
            ]
        });
        await client.application.commands.create({
            name: 'deletework',
            description: 'Delete work data for a user on a specific date (Admin only)',
            options: [
                {
                    name: 'user',
                    type: 6,
                    description: 'The user whose work data to delete',
                    required: true
                },
                {
                    name: 'date',
                    type: 3,
                    description: 'The date to delete (YYYY-MM-DD)',
                    required: true
                }
            ]
        });
        await client.application.commands.create({
            name: 'modifywork',
            description: 'Modify work data for a user on a specific date (Admin only)',
            options: [
                {
                    name: 'user',
                    type: 6,
                    description: 'The user whose work data to modify',
                    required: true
                },
                {
                    name: 'date',
                    type: 3,
                    description: 'The date to modify (YYYY-MM-DD)',
                    required: true
                },
                {
                    name: 'field',
                    type: 3,
                    description: 'Field to modify (start, end, break-X-start, break-X-end)',
                    required: true
                },
                {
                    name: 'value',
                    type: 3,
                    description: 'New value (e.g., 2025-06-07T14:30:00Z or 2:28:40 am)',
                    required: true
                }
            ]
        });
        await client.application.commands.create({
            name: 'showwork',
            description: 'Show work data for a user on a specific date (Admin only)',
            options: [
                {
                    name: 'user',
                    type: 6,
                    description: 'The user whose work data to show',
                    required: true
                },
                {
                    name: 'date',
                    type: 3,
                    description: 'The date to show (YYYY-MM-DD)',
                    required: true
                }
            ]
        });
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
});

client.login(TOKEN);
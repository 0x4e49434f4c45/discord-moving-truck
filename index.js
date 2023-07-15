'use strict'

const fs = require('fs')
const prompt = require('prompt-sync')();
const process = require('node:process')

const WEBHOOK_URL = 'webhook_goes_here'
const MESSAGES_FILE = 'path_to_export.json'
const START_MESSAGE_ID = 0n
const IMAGE_EXTNS = [ "jpg", "jpeg", "png", "gif", "webp" ]
const DISCORD_MAX_CONTENT_LENGTH = 2000
// undocumented rate limit of 30 requests/60s not exposed via headers
const FIXED_DELAY_MS = 2000
const RANDOM_DELAY_MAX_MS = 500
const DO_POST_TO_DISCORD = true

const channelExport = JSON.parse(fs.readFileSync(MESSAGES_FILE));
const messagesById = new Map();

(async function () {
    for(let i = 0; i < channelExport.messages.length; i++) {
        const message = channelExport.messages[i]
        messagesById.set(message.id, message)
        if(BigInt(message.id) < START_MESSAGE_ID) {
            continue
        }
        let timestamp = Date.parse(message.timestamp)
        let contentChunks = chunkContent(`<t:${ Math.floor(timestamp / 1000) }>\n${ message.content }`)
        let postBodies = contentChunks.map(c => ({
            content: c,
            username: message.author.name,
            avatar_url: message.author.avatarUrl
        }))
        let lastPostBody = postBodies[postBodies.length - 1]
        lastPostBody.embeds = [
            ...message.embeds.map(embedToEmbed),
            ...message.stickers.map(stickerToEmbed),
            ...message.attachments.map(attachmentToEmbed)
        ]
        if(message.reference?.messageId) {
            let referencedMessage = messagesById.get(message.reference.messageId)
            let embedDescription = `https://discord.com/channels/${message.reference.guildId ?? '@me'}/${message.reference.channelId}/${message.reference.messageId}`
            if(referencedMessage) {
                embedDescription += `\n**${referencedMessage.author.name}**: ${referencedMessage.content}`
            }
            lastPostBody.embeds.unshift({
                title: "Referenced Message",
                description: embedDescription
            })
        }
        for(let postBody of postBodies) {
            console.log(postBody);
            if(DO_POST_TO_DISCORD) {
                try {
                    let rateLimited
                    do {
                        rateLimited = false
                        const response = await fetch(WEBHOOK_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(postBody)
                        })
                        const rateLimitRemaining = parseInt(response.headers.get('x-ratelimit-remaining'), 10)
                        const rateLimitResetAfterMs = parseInt(response.headers.get('x-ratelimit-reset-after'), 10) * 1000
                        let msToWait = Math.max(rateLimitResetAfterMs / rateLimitRemaining, FIXED_DELAY_MS + Math.random() * RANDOM_DELAY_MAX_MS)
                        if(response.status === 429) {
                            rateLimited = true
                            msToWait = parseInt(response.headers.get('retry-after'), 10) * 1000
                            console.log(`Rate limited! Waiting ${msToWait}ms...`)
                        }
                        else if(!response.ok) {
                            console.log(`${response.status}: ${await response.text()}`)
                            console.log(`Failed to post message ${message.id}, halting.`)
                            process.exit(1)
                        }
                        console.log(`Rate limit: ${rateLimitRemaining} / ${rateLimitResetAfterMs}ms, waiting ${msToWait}ms...`)
                        let remainingMessages = channelExport.messages.length - i - 1
                        console.log(`Remaining: ${remainingMessages} / ${channelExport.messages.length} messages, eta ${Math.floor(remainingMessages / 1000 / 60 * (FIXED_DELAY_MS + RANDOM_DELAY_MAX_MS / 2))} min`)
                        await new Promise(resolve => setTimeout(resolve, msToWait))
                    } while(rateLimited)
                }
                catch(e) {
                    console.log(e);
                    console.log(`Failed to post message ${message.id}, halting.`)
                    process.exit(1)
                }
            }
        }
    }
})()

function embedToEmbed(embed) {
    let newEmbed = {
        title: embed.title,
        description: embed.description,
        url: embed.url,
        timestamp: embed.timestamp,
        color: embed.color ? parseInt(embed.color.substring(1), 16) : embed.color,
        footer: embed.footer,
        image: stripForbiddenImageProperties(embed.image),
        thumbnail: stripForbiddenImageProperties(embed.thumbnail),
        author: embed.author,
        fields: embed.fields
    }

    if(!newEmbed.title && !newEmbed.description && !newEmbed.image && !newEmbed.thumbnail) {
        // embed has no content fields populated that we can actually send
        // use the URL, if it's populated
        if(newEmbed.url) {
            newEmbed.description = newEmbed.url
        }
    }

    return newEmbed
}

function stripForbiddenImageProperties(img) {
    if(!img) return img

    let newImg = { ...img }
    delete newImg.height
    delete newImg.width
    delete newImg.proxy_url
    return newImg
}

function attachmentToEmbed(attachment) {
    let extension = attachment.fileName.split('.').pop().toLowerCase()

    let type = undefined

    if(IMAGE_EXTNS.includes(extension)) {
        type = 'image'
    }
    else {
        return {
            title: 'Attached File',
            description: attachment.url
        }
        while(true) {
            let choice = prompt(`Unknown attachment type for filename '${attachment.fileName}', choose (I)mage, (F)ile > `).toUpperCase()
            if(choice === 'I') {
                type = 'image'
                break
            }
            else if(choice === 'F') {
                return {
                    title: 'Attached File',
                    description: attachment.url
                }
            }
        }
    }

    return {
        [type]: { url: attachment.url }
    }
}

function stickerToEmbed(sticker) {
    return {
        title: 'Sticker',
        image: {
            url: sticker.sourceUrl
        }
    }
}

function chunkContent(content) {
    if(content.length < DISCORD_MAX_CONTENT_LENGTH) {
        return [content]
    }

    // first try to split at a line break
    let splitIndex = content.lastIndexOf('\n', DISCORD_MAX_CONTENT_LENGTH)
    // if no line break is found, try to split at a space
    if(splitIndex == -1) {
        splitIndex = content.lastIndexOf(' ', DISCORD_MAX_CONTENT_LENGTH)
    }
    // if no space is found, split at the max content length
    if(splitIndex == -1) {
        splitIndex = DISCORD_MAX_CONTENT_LENGTH
    }

    return [content.substring(0, splitIndex), ...chunkContent(content.substring(splitIndex))]
}

# discord-moving-truck

*Warning: this code is not production quality. It was put together quickly to solve a specific problem and does not
account for every use case. It will likely not be maintained at all. Consider it experimental. If you are not
comfortable reading and modifying JavaScript code, this tool may not be suitable for you.*

## About
discord-moving-truck is a script to push messages into a Discord channel via a webhook. It is designed to read
messages in JSON format as exported by [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter).

discord-moving-truck uses webhooks both to give the appearance of messages being posted by the original poster and to
simplify setup.

The motivating use case was to duplicate the contents of a Discord group chat into a server channel. It can also be
used to import messages from one channel to another one.

## Known Caveats
- Reactions are not copied.
- Custom emotes will not appear (they are replaced by their names).
- Attachments (e.g. images) are not re-uploaded. If they are deleted from the original source, the links will break and
the attachments will not appear.
- Due to webhook restrictions, videos will not embed. Instead, videos are copied as links to the original video file.
- Reply messages will embed a link to the referenced message, as well as the referenced message text. However, this link
points to the message in the original channel, as there is no way to retrieve message IDs posted by a Discord webhook.
- Due to Discord API rate limits, only about 1,600 messages per hour can be copied. If you have a long message history,
the process can take many hours.

## Usage
- Install [node.js](https://nodejs.org/en) if you haven't already. This script was built and tested against Node 18.
It will probably work on later versions.
- Generate a webhook URL for your target channel. Paste it in the `WEBHOOK_URL` constant in `index.js`.
- Export your messages from the desired DM, group chat, or channel using
[DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter). The messages must be exported in JSON format.
- Set `MESSAGES_FILE` in `index.js` to the path to the exported JSON file.
- Run `npm install`.
- Run `node index.js`.
- If you encounter an error, you can set `START_MESSAGE_ID` in `index.js` to the ID of the first message that didn't
post and then run `node index.js` again to avoid starting over. Be sure to keep the `n` after the ID as Discord message
IDs are too large for JavaScript `Number`s and need to be stored as `BigInt`s.

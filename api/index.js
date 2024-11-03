// Backend part that will run on Vercel to handle Slack button interactions.

// Required dependencies: Express for routing and Body-parser for handling JSON payloads.
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { google } = require('googleapis');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
app.use(bodyParser.json());

// Vercel handler for Slack button interactions
app.post('/api/task-complete', async (req, res) => {
  try {
    // Slack payload from the button click
    const payload = JSON.parse(req.body.payload);
    const { docId, taskIndex } = JSON.parse(payload.actions[0].value);

    // Google Auth setup
    const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS); // Credentials as an object from .env
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive']
    });
    const client = await auth.getClient();
    const docs = google.docs({ version: 'v1', auth: client });

    // Fetch the document from Google Docs
    const documentId = docId;
    const docResponse = await docs.documents.get({ documentId });
    const content = docResponse.data.body.content;

    // Locate the paragraph containing the taskIndex and mark it as completed
    if (content && content[taskIndex]) {
      const textRun = content[taskIndex].paragraph.elements[0].textRun;
      if (textRun) {
        const taskText = textRun.content.trim();
        // Update the paragraph with green checkmark and background color
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              {
                updateTextStyle: {
                  range: {
                    startIndex: textRun.startIndex,
                    endIndex: textRun.endIndex
                  },
                  textStyle: {
                    backgroundColor: { color: { rgbColor: { red: 0.83, green: 1.0, blue: 0.83 } } }
                  },
                  fields: 'backgroundColor'
                }
              },
              {
                insertText: {
                  location: { index: textRun.startIndex },
                  text: '✅ '
                }
              }
            ]
          }
        });
      }
    }

    // Respond to Slack to replace the original button with "Hotovo" button
    const responseUrl = payload.response_url;
    const responsePayload = {
      replace_original: true,
      blocks: payload.message.blocks.map(block => {
        if (block.accessory && block.accessory.action_id === payload.actions[0].action_id) {
          block.accessory = {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Hotovo'
            },
            style: 'primary',
            action_id: 'completed',
            value: 'completed',
            confirm: {
              title: {
                type: 'plain_text',
                text: 'Úkol je hotov'
              },
              text: {
                type: 'mrkdwn',
                text: 'Úkol byl označen jako hotový.'
              }
            },
            disabled: true
          };
        }
        return block;
      })
    };

    await fetch(responseUrl, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SLACK_TOKEN}`
      },
      body: JSON.stringify(responsePayload)
    });

    res.status(200).send('Task completion handled successfully.');
  } catch (error) {
    console.error('Error handling task completion:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Export the app for Vercel
module.exports = app;

/**
 * Instructions for Deployment on Vercel:
 *
 * 1. Create an account on [Vercel](https://vercel.com) if you haven't already.
 * 2. Install Vercel CLI by running: `npm install -g vercel`.
 * 3. Create the following files in your project folder:
 *
 *    a. `index.js` - This file contains the backend code (as seen above).
 *
 *    b. `package.json` - This file lists the dependencies required for the project. Here is an example:
 *       {
 *         "name": "slack-vercel-integration",
 *         "version": "1.0.0",
 *         "main": "index.js",
 *         "license": "MIT",
 *         "scripts": {
 *           "start": "node index.js"
 *         },
 *         "dependencies": {
 *           "express": "^4.17.1",
 *           "body-parser": "^1.19.0",
 *           "googleapis": "^78.0.0",
 *           "node-fetch": "^2.6.1",
 *           "dotenv": "^10.0.0"
 *         }
 *       }
 *
 *    c. `vercel.json` - This file is used to configure your Vercel deployment.
 *       {
 *         "version": 2,
 *         "builds": [
 *           { "src": "index.js", "use": "@vercel/node" }
 *         ],
 *         "routes": [
 *           { "src": "/api/task-complete", "dest": "/index.js" }
 *         ]
 *       }
 *
 *    d. `.env` - This file stores sensitive credentials such as Google and Slack tokens.
 *       Example of `.env` file:
 *       GOOGLE_CREDENTIALS={"type":"service_account","project_id":"your_project_id","private_key_id":"your_private_key_id","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n","client_email":"your_service_account_email","client_id":"your_client_id","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"YOUR_CLIENT_CERT_URL"}
 *       SLACK_TOKEN=xoxb-your-slack-bot-token
 *
 * 4. Navigate to your project folder in the terminal and run `vercel` to initiate the deployment.
 * 5. Follow the prompts provided by the Vercel CLI to deploy your backend.
 * 6. Once deployed, update the Slack interaction endpoint to point to the newly deployed Vercel endpoint URL.
 * 7. Make sure your Slack app is configured to receive interactions by navigating to your Slack App settings.
 *
 * To run the application locally, simply use `npm install` to install dependencies and then run `npm start`.
 */

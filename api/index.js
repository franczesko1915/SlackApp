// Backend code to handle Slack button interactions in a Vercel app, including signature validation for security.

import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const app = express();
app.use(express.urlencoded({ extended: true })); // Middleware to parse JSON body
app.use(express.raw({ type: '*/*' })); // Replaces manual concatenation of rawBody

// Environment variables
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const slackToken = process.env.SLACK_BOT_TOKEN;

// Helper function to verify Slack request signature
function verifySlackRequest(req) {
  console.log('Verifying Slack request signature...');
  const slackSignature = req.headers['x-slack-signature'];
  const slackRequestTimestamp = req.headers['x-slack-request-timestamp'];
  
  if (!slackSignature || !slackRequestTimestamp) {
    console.error('Missing Slack signature or timestamp headers');
    return false;
  }

  const time = Math.floor(new Date().getTime() / 1000);
  console.log(`Current time: ${time}, Slack request timestamp: ${slackRequestTimestamp}`);
  
  // Deny requests older than 5 minutes
  if (Math.abs(time - slackRequestTimestamp) > 60 * 5) {
    console.error('Request timestamp is older than 5 minutes. Possible replay attack.');
    return false;
  }

  const sigBaseString = `v0:${slackRequestTimestamp}:${req.rawBody}`;
  console.log('Signature base string:', sigBaseString);
  const hmac = crypto.createHmac('sha256', slackSigningSecret);
  hmac.update(sigBaseString);
  const mySignature = `v0=${hmac.digest('hex')}`;

  console.log('Generated signature:', mySignature);
  const verified = crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
  if (!verified) {
    console.error('Slack request verification failed. Signature does not match.');
  }
  
  return verified;
}

// Async function to handle Slack task completion
async function handleSlackTaskCompletion(req) {
  try {
    console.log('Starting async task handling...');
    if (!req.body || !req.body.payload) {
      console.error('Payload is missing');
      return;
    }
    const payload = JSON.parse(decodeURIComponent(req.body.payload));
    console.log('Payload received:', payload);

    if (!payload || !payload.actions || !payload.actions[0]) {
      console.error('Invalid payload structure');
      return;
    }
    console.log('Payload parsed successfully:', payload);

    const actionValue = JSON.parse(payload.actions[0].value);
    console.log('Action value:', actionValue);
    const docId = actionValue.docId;
    const taskIndex = actionValue.taskIndex;
    if (!docId || taskIndex === undefined) {
      console.error('Missing docId or taskIndex');
      return;
    }
    console.log('docId and taskIndex extracted:', { docId, taskIndex });

    const responseUrl = payload.response_url;
    console.log('Response URL:', responseUrl);
    console.log('Proceeding with task handling asynchronously after Slack response.');

    // Google Apps Script integration to mark task as completed
    const SCOPES = ['https://www.googleapis.com/auth/documents'];
    const client = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\n/g, '\n'),
      scopes: SCOPES,
    });

    await client.authorize();
    console.log('Google client authorized successfully');
    const docs = google.docs({ version: 'v1', auth: client });

    const docRes = await docs.documents.get({ documentId: docId });
    console.log('Document retrieved successfully:', docRes.data);
    if (!docRes.data.body.content[taskIndex] || !docRes.data.body.content[taskIndex].paragraph) {
      console.error('Invalid taskIndex, paragraph not found');
      return;
    }

    const taskText = docRes.data.body.content[taskIndex].paragraph.elements[0].textRun.content;
    console.log('Task text:', taskText);
    const updatedText = `✅ ${taskText}`;
    console.log('Updated task text:', updatedText);

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            updateTextStyle: {
              textStyle: {
                backgroundColor: {
                  color: {
                    rgbColor: { red: 0.83, green: 0.93, blue: 0.85 },
                  },
                },
              },
              range: {
                startIndex: taskIndex,
                endIndex: taskIndex + taskText.length,
              },
            },
          },
          {
            insertText: {
              location: {
                index: taskIndex,
              },
              text: updatedText,
            },
          },
        ],
      },
    });
    console.log('Document updated successfully');

    // Respond to Slack with updated message
    const responsePayload = {
      replace_original: true,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ ${taskText}`,
          },
        },
      ],
    };

    console.log('Sending response to Slack with updated message...');
    await fetch(responseUrl, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responsePayload),
    });
    console.log('Response sent to Slack successfully');
  } catch (err) {
    console.error('Error during processing:', err);
  }
}

// Endpoint to handle Slack button interactions
app.post('/api/task-complete', async (req, res) => {
  console.log('Received a request to /api/task-complete');
  console.log('Headers:', req.headers);

  if (!verifySlackRequest(req)) {
    console.error('Slack request verification failed');
    return res.status(400).send('Verification failed');
  }

  res.status(200).send('OK'); // Respond immediately to avoid timeout

  console.log('Slack request verified, response sent. Starting async task handling.');

  // Asynchronous operations are now moved to a separate function
  handleSlackTaskCompletion(req).catch(err => console.error('Error in async task handling:', err));
});

export default app;

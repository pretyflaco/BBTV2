import { getParams } from 'js-lnurl';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lnurl, paymentRequest } = req.body;

    if (!lnurl) {
      return res.status(400).json({ error: 'Missing lnurl parameter' });
    }

    if (!paymentRequest) {
      return res.status(400).json({ error: 'Missing paymentRequest parameter' });
    }

    console.log('Processing LNURL withdraw request for Boltcard...');
    console.log('LNURL:', lnurl);
    console.log('Payment Request (invoice):', paymentRequest.substring(0, 50) + '...');

    // Parse the LNURL to get the withdraw parameters
    const lnurlParams = await getParams(lnurl);

    // Validate that it's a withdraw request (Boltcard)
    if (!('tag' in lnurlParams && lnurlParams.tag === 'withdrawRequest')) {
      return res.status(400).json({
        error: 'Not a properly configured LNURL withdraw tag',
        reason: 'This is not a valid Boltcard or LNURL-withdraw compatible card'
      });
    }

    const { callback, k1 } = lnurlParams;

    // Build the callback URL with the required parameters
    const urlObject = new URL(callback);
    const searchParams = urlObject.searchParams;
    searchParams.set('k1', k1);
    searchParams.set('pr', paymentRequest);

    const url = urlObject.toString();

    console.log('Calling Boltcard callback URL...');

    // Make the request to the Boltcard service
    const result = await fetch(url);
    const data = await result.json();

    console.log('Boltcard callback response:', data);

    if (result.ok) {
      return res.status(200).json(data);
    } else {
      return res.status(400).json(data);
    }
  } catch (error) {
    console.error('Error processing LNURL request:', error);
    return res.status(500).json({
      error: 'Failed to process LNURL request',
      message: error.message
    });
  }
}


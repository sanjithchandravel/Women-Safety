require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');

const app = express();
const mongoUrl =
	'mongodb+srv://sharpsanjith:root@cluster0.xujyw.mongodb.net/safety_analytics?retryWrites=true&w=majority';
const dbName = 'safety_analytics';
const port = process.env.PORT || 8080;

const client = new MongoClient(mongoUrl, {
	tls: true,
	tlsAllowInvalidCertificates: false, // For production, set this to false
});

let db;
let trackingCollection;

app.use(bodyParser.json());

async function initialize() {
	try {
		await client.connect();
		console.log('Connected to MongoDB');
		db = client.db(dbName);
		trackingCollection = db.collection('tracking');

		app.listen(port, '0.0.0.0', () => {
			console.log(`Server running on http://0.0.0.0:${port}`);
		});
	} catch (error) {
		console.error('Error connecting to MongoDB:', error);
		process.exit(1);
	}
}

app.post('/location', async (req, res) => {
	const data = req.body;

	console.log('Received location data:', data);

	if (!trackingCollection) {
		console.error('Tracking collection is not initialized.');
		return res.status(500).send('Server error');
	}

	try {
		const result = await trackingCollection.updateOne(
			{ userId: data.user },
			{
				$set: {
					latitude: data.latitude,
					longitude: data.longitude,
					gender: data.gender,
					timestamp: data.timestamp || new Date(),
					isSOS: data.isSOS || false,
				},
			},
			{ upsert: true }
		);

		console.log('Update result:', result);
		res.status(200).send('Location data received and processed');
	} catch (error) {
		console.error('Error processing location data:', error);
		res.status(500).send('Error processing location data');
	}
});

initialize();

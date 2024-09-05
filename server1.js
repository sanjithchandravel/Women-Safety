require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');

const app = express();

//const mongoUrl = process.env.MONGO_URL;
const mongoUrl =
	'mongodb+srv://sharpsanjith:root@cluster0.xujyw.mongodb.net/safety_analytics?retryWrites=true&w=majority';
const dbName = 'safety_analytics';
const proximityRadius = 100; // Radius in meters
const edgeUpdateInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
const port = process.env.PORT || 8080;

// Create MongoDB client
const client = new MongoClient(mongoUrl);

let db;
let trackingCollection;

// Middleware
app.use(bodyParser.json());

// Connect to MongoDB and initialize collection
async function initialize() {
	try {
		await client.connect();
		console.log('Connected to MongoDB');
		db = client.db(dbName);
		trackingCollection = db.collection('tracking');

		// Start the Express server after MongoDB connection is established
		app.listen(port, '0.0.0.0', () => {
			console.log(`Express server running on http://0.0.0.0:${port}`);
		});

		// Periodic update of edges
		setInterval(async () => {
			try {
				if (trackingCollection) {
					await updateEdges();
				} else {
					console.error('Tracking collection is not initialized.');
				}
			} catch (error) {
				console.error('Error during edge update:', error);
			}
		}, edgeUpdateInterval);
	} catch (error) {
		console.error('Error connecting to MongoDB:', error);
		process.exit(1);
	}
}

// Route to handle location updates
app.post('/location', async (req, res) => {
	const data = req.body;

	console.log('Received location data:', data);

	if (!trackingCollection) {
		console.error('Tracking collection is not initialized.');
		return res.status(500).send('Server error');
	}

	try {
		console.log('Attempting to update or insert data...');

		// Update node in MongoDB, or insert if not found (upsert)
		const result = await trackingCollection.updateOne(
			{ userId: data.user }, // Match by userId
			{
				$set: {
					latitude: data.latitude,
					longitude: data.longitude,
					gender: data.gender,
					timestamp: data.timestamp || new Date(),
					isSOS: data.isSOS || false,
				},
			},
			{ upsert: true } // Insert if the user does not exist
		);

		console.log('Update result:', result);

		if (result.upsertedCount > 0) {
			console.log(`New user added with userId ${data.user}`);
		} else {
			console.log(`User ${data.user} details updated.`);
		}

		console.log('Updating edges...');
		await updateEdges();
		console.log('Edges updated.');

		console.log('Performing detections...');
		await detectLoneWoman(data.user);
		await detectSurroundedByMen(data.user);
		console.log('Detections complete.');

		res.status(200).send('Location data received and processed');
	} catch (error) {
		console.error('Error processing location data:', error);
		res.status(500).send('Error processing location data');
	}
});

// Update edges based on proximity
async function updateEdges() {
	if (!trackingCollection) {
		throw new Error('Tracking collection is not initialized');
	}

	const nodes = await trackingCollection.find({}).toArray();
	const userIds = nodes.map((node) => node.userId);

	// Clear existing edges
	await trackingCollection.updateMany({}, { $set: { edges: [] } });

	for (let i = 0; i < userIds.length; i++) {
		for (let j = i + 1; j < userIds.length; j++) {
			const user1 = nodes.find((node) => node.userId === userIds[i]);
			const user2 = nodes.find((node) => node.userId === userIds[j]);

			if (
				user1.gender !== user2.gender &&
				isWithinProximity(user1, user2)
			) {
				await trackingCollection.updateOne(
					{ userId: userIds[i] },
					{ $addToSet: { edges: userIds[j] } }
				);
				await trackingCollection.updateOne(
					{ userId: userIds[j] },
					{ $addToSet: { edges: userIds[i] } }
				);
			}
		}
	}
}

// Check if two users are within proximity radius
function isWithinProximity(user1, user2) {
	const distance = getDistance(
		user1.latitude,
		user1.longitude,
		user2.latitude,
		user2.longitude
	);
	return distance <= proximityRadius;
}

// Calculate distance between two latitude/longitude points using Haversine formula
function getDistance(lat1, lon1, lat2, lon2) {
	const R = 6371e3; // Radius of Earth in meters
	const φ1 = (lat1 * Math.PI) / 180;
	const φ2 = (lat2 * Math.PI) / 180;
	const Δφ = ((lat2 - lat1) * Math.PI) / 180;
	const Δλ = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

// Lone Woman Detection
async function detectLoneWoman(userId) {
	const user = await trackingCollection.findOne({ userId });
	const currentHour = new Date(user.timestamp).getHours();

	if (user.gender === 'Female' && (currentHour >= 22 || currentHour < 6)) {
		const nearbyMales = await trackingCollection
			.find({
				gender: 'Male',
				userId: { $ne: userId },
			})
			.toArray();

		if (nearbyMales.length === 0) {
			console.log(
				`Lone woman detected at night for user ${userId} at location (${user.latitude}, ${user.longitude}).`
			);
		}
	}
}

// Surrounded by Men Detection
async function detectSurroundedByMen(userId) {
	const user = await trackingCollection.findOne({ userId });
	const edges = (await trackingCollection.findOne({ userId })).edges || [];

	if (user.gender === 'Female' && edges.length >= 3) {
		console.log(
			`Woman surrounded by men detected for user ${userId} at location (${user.latitude}, ${user.longitude}).`
		);
	}
}

// Initialize the server
initialize();

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { setInterval } = require('timers');

// Create an Express app
const app = express();
const mongoUrl =
	'mongodb+srv://sharpsanjith:root@cluster0.xujyw.mongodb.net/safety_analytics?retryWrites=true&w=majority';
const port = process.env.PORT || 8080;
const proximityRadius = 100; // Radius in meters
const edgeUpdateInterval = 1 * 60 * 1000; // 5 minutes in milliseconds

// Define a Mongoose schema and model
const trackingSchema = new mongoose.Schema({
	userId: String,
	latitude: Number,
	longitude: Number,
	gender: String,
	timestamp: { type: Date, default: Date.now },
	isSOS: { type: Boolean, default: false },
	edges: [String], // Stores IDs of users in proximity
});

const Tracking = mongoose.model('trackings', trackingSchema);

// Middleware
app.use(bodyParser.json());

async function initialize() {
	try {
		await mongoose.connect(mongoUrl, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
			tls: true,
			tlsAllowInvalidCertificates: false, // For production, set this to false
		});

		console.log('Connected to MongoDB');

		app.listen(port, '0.0.0.0', () => {
			console.log(`Server running on http://0.0.0.0:${port}`);
		});

		// Periodic update of edges
		setInterval(async () => {
			try {
				await updateEdges();
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

	try {
		// Update or insert location data
		const result = await Tracking.updateOne(
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

		// Update edges and perform detections
		await updateEdges();
		await detectLoneWoman(data.user);
		await detectSurroundedByMen(data.user);

		res.status(200).send('Location data received and processed');
	} catch (error) {
		console.error('Error processing location data:', error);
		res.status(500).send('Error processing location data');
	}
});

// Retrieve all location data
app.post('/get', async (req, res) => {
	try {
		const allLocations = await Tracking.find({});
		res.status(200).json(allLocations);
	} catch (error) {
		console.error('Error retrieving location data:', error);
		res.status(500).send('Error retrieving location data');
	}
});

async function updateEdges() {
	const nodes = await Tracking.find({}).exec();
	const userIds = nodes.map((node) => node.userId);

	// Clear existing edges
	await Tracking.updateMany({}, { $set: { edges: [] } });

	for (let i = 0; i < userIds.length; i++) {
		for (let j = i + 1; j < userIds.length; j++) {
			const user1 = nodes.find((node) => node.userId === userIds[i]);
			const user2 = nodes.find((node) => node.userId === userIds[j]);

			if (
				user1.gender !== user2.gender &&
				isWithinProximity(user1, user2)
			) {
				const updatedEdges1 = await Tracking.findOneAndUpdate(
					{ userId: userIds[i] },
					{ $addToSet: { edges: userIds[j] } },
					{ new: true }
				);

				const updatedEdges2 = await Tracking.findOneAndUpdate(
					{ userId: userIds[j] },
					{ $addToSet: { edges: userIds[i] } },
					{ new: true }
				);

				console.log(
					`Edges updated for user ${userIds[i]}: ${updatedEdges1.edges}`
				);
				console.log(
					`Edges updated for user ${userIds[j]}: ${updatedEdges2.edges}`
				);
			}
		}
	}
}

async function detectLoneWoman(userId) {
	const user = await Tracking.findOne({ userId }).exec();
	if (!user) {
		console.log(`User with ID ${userId} not found.`);
		return;
	}

	console.log(
		`Checking lone woman detection for user ${userId}. Current edges: ${user.edges}`
	);

	// Check if the edges array is empty
	if (user.edges.length === 0) {
		console.log(
			`User ${userId} is alone at location (${user.latitude}, ${user.longitude}).`
		);

		// Optionally check if it is nighttime
		const currentHour = new Date(user.timestamp).getHours();
		if (
			user.gender === 'Female' &&
			(currentHour >= 22 || currentHour < 6)
		) {
			console.log(
				`Lone woman detected at night for user ${userId} at location (${user.latitude}, ${user.longitude}).`
			);
		}
	}
}

async function detectSurroundedByMen(userId) {
	const user = await Tracking.findOne({ userId }).exec();
	const edges = user.edges || [];

	if (user.gender === 'Female' && edges.length >= 3) {
		console.log(
			`Woman surrounded by men detected for user ${userId} at location (${user.latitude}, ${user.longitude}).`
		);
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

// Initialize the app
initialize();

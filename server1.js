require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// Create an Express app
const app = express();
const mongoUrl =
	process.env.MONGO_URL ||
	'mongodb+srv://sharpsanjith:root@cluster0.xujyw.mongodb.net/safety_analytics';
const port = process.env.PORT || 8080;

// Define a Mongoose schema and model
const trackingSchema = new mongoose.Schema({
	userId: String,
	latitude: Number,
	longitude: Number,
	gender: String,
	timestamp: { type: Date, default: Date.now },
	isSOS: { type: Boolean, default: false },
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
	} catch (error) {
		console.error('Error connecting to MongoDB:', error);
		process.exit(1);
	}
}

// Endpoint to receive location data
app.post('/location', async (req, res) => {
	const data = req.body;

	console.log('Received location data:', data);

	try {
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
		res.status(200).send('Location data received and processed');
	} catch (error) {
		console.error('Error processing location data:', error);
		res.status(500).send('Error processing location data');
	}
});

// Initialize the app
initialize();

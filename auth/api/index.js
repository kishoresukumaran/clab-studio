const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

// Create Express app
const app = express();
const port = process.env.API_PORT || 3000;

// Configure CORS to allow all origins
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Connect to MongoDB with retry logic
const connectWithRetry = () => {
  // The format is: mongodb://username:password@hostname:port/database?authSource=admin
  const mongoUri = process.env.MONGODB_URI || "mongodb://admin:password@mongo:27017/auth?authSource=admin";
  console.log(`Attempting to connect to MongoDB at ${mongoUri.replace(/\/\/([^:]+):[^@]+@/, '//\\$1:****@')}`);
  
  mongoose.connect(mongoUri)
    .then(() => {
      console.log("Successfully connected to MongoDB");
    })
    .catch(err => {
      console.error("MongoDB connection error:", err);
      console.log("Retrying connection in 5 seconds...");
      setTimeout(connectWithRetry, 5000);
    });
};

// Initial connection
connectWithRetry();

// Define User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  displayName: { type: String }
});

// Create User Model
const User = mongoose.model("User", UserSchema);

// API Routes
// Get a single user
app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id, { password: 0 });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ message: "Failed to fetch user" });
  }
});

// Verify user (for authentication)
app.post("/api/auth/verify-user", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Username and password are required" 
      });
    }

    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Simple password comparison (not hashed for this example)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Return user info without the password
    const userInfo = {
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role
    };

    return res.status(200).json({
      success: true,
      user: userInfo
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication service error"
    });
  }
});

// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    return res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Create new user
app.post("/api/users", async (req, res) => {
  try {
    const { username, password, role, displayName } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: "Username already exists" });
    }
    
    // Create new user
    const newUser = new User({
      username,
      password,
      role,
      displayName: displayName || username
    });
    
    await newUser.save();
    
    // Return created user without password
    const savedUser = await User.findById(newUser._id, { password: 0 });
    return res.status(201).json(savedUser);
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ message: "Failed to create user" });
  }
});

// Update user
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role, displayName } = req.body;
    
    // Check if changing username to one that already exists
    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: id } });
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { 
        ...(username && { username }),
        ...(password && { password }),
        ...(role && { role }),
        ...(displayName && { displayName })
      },
      { new: true, select: "-password" }
    );
    
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    return res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ message: "Failed to update user" });
  }
});

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedUser = await User.findByIdAndDelete(id);
    
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    return res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

// Add a simple endpoint to check if the API is running
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Auth API is running" });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Auth API server running on port ${port} and listening on all interfaces`);
});

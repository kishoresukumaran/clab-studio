// This script will be executed when MongoDB container starts

// Switch to the auth database
db = db.getSiblingDB("auth");

// Create users collection if it doesn't exist
db.createCollection("users");

// Remove existing users (to avoid duplicates)
db.users.deleteMany({});

// Insert initial users
db.users.insertMany([
  {
    username: "labadmin",
    password: "arastra",
    role: "admin",
    displayName: "admin"
  },
  {
    username: "kishore",
    password: "arastra",
    role: "user",
    displayName: "kishore"
  }
]);

// Create a unique index on username
db.users.createIndex({ username: 1 }, { unique: true });

print("MongoDB initialization complete!");

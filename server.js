const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

//middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })
);
app.use(express.json());

//connect to mongoDB
const SRV_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  'mongodb+srv://swetasakthivel5_db_user:WxcHtBksA0UfbyXe@cluster0.x8bnj3o.mongodb.net/taskmanager?retryWrites=true&w=majority';

const DIRECT_URI =
  'mongodb://swetasakthivel5_db_user:WxcHtBksA0UfbyXe@ac-aedmbht-shard-00-00.x8bnj3o.mongodb.net:27017,ac-aedmbht-shard-00-01.x8bnj3o.mongodb.net:27017,ac-aedmbht-shard-00-02.x8bnj3o.mongodb.net:27017/taskmanager?ssl=true&replicaSet=atlas-ecjxz2-shard-0&authSource=admin&retryWrites=true&w=majority';

let dbError = null;
let activeUri = SRV_URI;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }
  try {
    activeUri = SRV_URI;
    await mongoose.connect(SRV_URI, { serverSelectionTimeoutMS: 5000 });
    dbError = null;
    console.log('connected to MongoDB via SRV');
  } catch (err1) {
    console.warn('SRV connection failed, trying direct ReplicaSet:', err1.message);
    try {
      activeUri = DIRECT_URI;
      await mongoose.connect(DIRECT_URI, { serverSelectionTimeoutMS: 5000 });
      dbError = null;
      console.log('connected to MongoDB via Direct ReplicaSet');
    } catch (err2) {
      dbError = err2.message;
      console.error('All MongoDB connection attempts failed:', err2.message);
    }
  }
};

// Initial connection attempt
connectDB();

// Middleware to reconnect if disconnected
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }
  next();
});

//define task schema and model
const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in progress', 'completed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

const Task = mongoose.model('Task', TaskSchema);

//routes
//health check route
app.get('/', async (req, res) => {
  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'server is running',
    database: states[mongoose.connection.readyState] || 'unknown',
    dbError: dbError,
    uriUsed: activeUri ? activeUri.replace(/:([^@]+)@/, ':****@') : 'none',
  });
});

//fetch tasks
app.get('/tasks', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    const tasks = await Task.find();
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({
      message: 'couldnt fetch tasks',
      error: err.message,
      dbStatus: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      dbError: dbError,
    });
  }
});

//create new task
app.post('/tasks', async (req, res) => {
  const { title, status } = req.body;
  const task = new Task({ title, status });
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    const savedTask = await task.save();
    res.status(201).json(savedTask);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(400).json({ message: 'couldnt create task', error: err.message });
  }
});

//update task
app.patch('/tasks/:id', async (req, res) => {
  const { status } = req.body;
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found.' });
    }
    res.json(updatedTask);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(400).json({ message: 'couldnt update task', error: err.message });
  }
});

//delete tasks
app.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    const deletedTask = await Task.findByIdAndDelete(id);
    if (!deletedTask) {
      return res.status(404).json({ message: 'task not found' });
    }
    res.json({ message: 'task deleted successfully' });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(400).json({ message: 'couldnt delete task', error: err.message });
  }
});

//server configuration
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});

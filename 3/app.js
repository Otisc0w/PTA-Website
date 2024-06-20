const express = require('express');
const path = require('path');
const multer = require('multer');
const hbs = require('hbs');
const session = require('express-session');
const app = express();
const cron = require('node-cron');
const axios = require('axios');

// Replace these with your actual API keys from PayMongo
const PAYMONGO_SECRET_KEY = 'sk_test_rfwrr7CgVzNP4AnGJcjU6yFa';
const PAYMONGO_PUBLIC_KEY = 'pk_test_tfhdABT3Jvix9Wvsbv5AGP6d';

const instance = axios.create({
  baseURL: 'https://api.paymongo.com/v1',
  headers: {
    'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY).toString('base64')}`,
    'Content-Type': 'application/json',
  }
});

const createPaymentIntent = async (amount, currency) => {
  try {
    const response = await instance.post('/payment_intents', {
      data: {
        attributes: {
          amount: amount * 100, 
          currency: currency,
          payment_method_allowed: ['card'],
          capture_type: 'automatic'
        }
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error creating payment intent:', error.response.data);
    throw error;
  }
};

const attachPaymentMethod = async (paymentIntentId, paymentMethodId) => {
  try {
    const response = await instance.post(`/payment_intents/${paymentIntentId}/attach`, {
      data: {
        attributes: {
          payment_method: paymentMethodId
        }
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error attaching payment method:', error.response.data);
    throw error;
  }
};

module.exports = {
  createPaymentIntent,
  attachPaymentMethod
};entMethod

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded data

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

async function checkAndRemoveOldRegistrations() {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(); // 4 hours ago in ISO format
  const oneSecondAgo = new Date(Date.now() - 1 * 1000).toISOString();

  try {
    // Fetch registrations with status '4' older than 4 hours
    const { data: registrations, error: fetchError } = await supabase
      .from('ncc_registrations')
      .select('*')
      .eq('status', 4)
      .lt('updated_at', fourHoursAgo);

    if (fetchError) {
      console.error('Error fetching registrations:', fetchError.message);
      return;
    }

    for (const registration of registrations) {
      // Delete the registration from the 'ncc_registrations' table
      const { error: deleteRegError } = await supabase
        .from('ncc_registrations')
        .delete()
        .eq('id', registration.id);

      if (deleteRegError) {
        console.error('Error deleting registration:', deleteRegError.message);
      } else {
        console.log(`Deleted registration with ID: ${registration.id}`);
      }
    }
  } catch (error) {
    console.error('Server error:', error.message);
  }
}
cron.schedule('0 * * * *', checkAndRemoveOldRegistrations);

hbs.registerHelper('reverseEach', function(context, options) {
  let out = '';
  for (let i = context.length - 1; i >= 0; i--) {
    out += options.fn(context[i]);
  }
  return out;
});

hbs.registerHelper('eq', function (a, b) {
  return a === b;
});

// Configure express-session
app.use(session({
  secret: 'your_secret_key', // Replace with a secure secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Set up Handlebars view engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Route to fetch and display data on the index page
app.get('/', async (req, res) => {
  try {
    // Fetch users data
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError) {
      return res.status(400).json({ error: usersError.message });
    }

    // Fetch athletes data
    const { data: athletes, error: athletesError } = await supabase
      .from('athletes')
      .select('*');

    if (athletesError) {
      return res.status(400).json({ error: athletesError.message });
    }

    console.log("Fetched users data:", users); // Log the users data to the console
    console.log("Fetched athletes data:", athletes); // Log the athletes data to the console

    // Render the index.hbs template with the fetched data
    res.render('index', { users, athletes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Example route to get a specific row from Supabase and log it
app.get('/data/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single(); // single() ensures we get a single row

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Event registration route
app.post('/events/register', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const { eventId } = req.body;
  const userId = req.session.user.id;

  console.log('Registering user:', userId, 'for event:', eventId);

  try {
    // Check if the user is already registered for the event
    const { data: existingRegistration, error: checkError } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .single();

    if (checkError) {
      console.error('Error checking existing registration:', checkError.message);
      return res.status(500).json({ error: checkError.message });
    }

    if (existingRegistration) {
      return res.status(400).json({ msg: 'You are already registered for this event.' });
    }

    // Register the user for the event
    const { data, error } = await supabase
      .from('event_registrations')
      .insert([{ user_id: userId, event_id: eventId }]);

    if (error) {
      console.error('Error registering for event:', error.message);
      throw error;
    }

    console.log('Successfully registered user:', userId, 'for event:', eventId);

    res.status(200).json({ msg: 'Successfully registered for the event!' });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Submit Login
app.post('/submit-login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single(); // Ensure a single match

    if (error || !data) {
      // Invalid credentials
      return res.status(401).render('index', {
        error: 'Invalid username or password.',
        users: [], // Pass users array if needed
        athletes: [] // Pass athletes array if needed
      });
    }

    // Store user information in session
    req.session.user = {
      id: data.id,
      firstname: data.firstname,
      middlename: data.middlename,
      lastname: data.lastname,
      username: data.username,
      email: data.email,
      password: data.password,
      usertype: data.usertype,
      club: data.club,
      region: data.region,
      registered: data.registered,
      profilepic: data.profilepic
    };

    // Successful login
    res.redirect('/home');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit Signup
app.post('/submit-signup', async (req, res) => {
  const { username, password, confpassword } = req.body; // Capture user input from the form

  // Validate the input
  if (password !== confpassword) {
    return res.status(400).render('index', {
      error: 'Passwords do not match.',
      users: [] // Optionally pass users array if you need it in the view
    });
  }

  try {
    // Insert the new user into the database
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password }]);

    if (error) {
      // Handle any errors that occur during the insert
      return res.status(500).render('index', {
        error: 'Error creating user.',
        users: [] // Optionally pass users array if you need it in the view
      });
    }

    // Redirect to the login page after successful signup
    res.redirect('/');
  } catch (error) {
    // Handle any server-side errors
    res.status(500).json({ error: error.message });
  }
});

// Submit NCC
app.post('/submit-ncc', async (req, res) => {
  const {
    apptype,
    firstname,
    middlename,
    lastname,
    gender,
    bday,
    phonenum,
    email,
    lastpromo,
    promolocation,
    clubregion,
    clubname,
    beltlevel,
    instructorfirstname,
    instructormi,
    instructorlastname,
    instructormobile,
    instructoremail
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const submittedby = req.session.user.username; // Get the current user's username from the session
  const status = 1;

  try {
    // Insert the new user into the database
    const { data, error } = await supabase
      .from('ncc_registrations')
      .insert([{
        apptype,
        firstname,
        middlename,
        lastname,
        gender,
        bday,
        phonenum,
        email,
        lastpromo,
        promolocation,
        clubregion,
        clubname,
        beltlevel,
        instructorfirstname,
        instructormi,
        instructorlastname,
        instructormobile,
        instructoremail,
        status,
        submittedby // Include the current user's username
      }]);

    if (error) {
      // Handle any errors that occur during the insert
      return res.status(500).render('membership', {
        error: 'Error creating registration.',
        users: [] // Optionally pass users array if you need it in the view
      });
    }
    res.redirect('/membership');
  } catch (error) {
    // Handle any server-side errors
    res.status(500).json({ error: error.message });
  }
});

// Create Post
app.post('/create-post', async (req, res) => {
  const {
    title,
    topic,
    body,
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  
  const originalposter = req.session.user.username; // Get the current user's id from the session
  const upvotes = 0, downvotes=0;

  try {
    // Update the user in the database
    const { data, error } = await supabase
      .from('forum_threads')
      .insert([{
        title,
        originalposter,
        topic,
        body,
        upvotes,
        downvotes
      }]);

    if (error) {
      // Handle any errors that occur during the update
      return res.status(500).render('forum', {
        error: 'Error updating profile.',
        users: [] // Optionally pass users array if you need it in the view
      });
    }

    res.redirect('/forum');
  } catch (error) {
    // Handle any server-side errors
    res.status(500).json({ error: error.message });
  }
});

// Save Profile Changes
app.post('/save-profile-changes', upload.single('file'), async (req, res) => {
  const {
    firstname,
    middlename,
    lastname,
    username,
    email,
    password,
    usertype,
    region,
    club,
    registered,
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const id = req.session.user.id; // Get the current user's id from the session
  let profilepic = req.session.user.profilepic;

  if (req.file) {
    try {
      const filePath = `profilepics/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase
        .storage
        .from('profilepics')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        console.error('Error uploading profile picture:', uploadError.message);
        return res.status(500).send('Error uploading profile picture');
      }

      profilepic = `${supabaseUrl}/storage/v1/object/public/profilepics/${filePath}`;
    } catch (error) {
      console.error('Server error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    // Update the user in the database
    const { data, error } = await supabase
      .from('users')
      .update({
        firstname,
        middlename,
        lastname,
        username,
        email,
        password,
        usertype,
        region,
        club,
        registered,
        profilepic
      })
      .eq('id', id); // Ensure the correct id is used in the eq method

    if (error) {
      console.error('Error updating profile:', error.message);
      return res.status(500).render('home', {
        error: 'Error updating profile.',
        users: [] // Optionally pass users array if you need it in the view
      });
    }

    // Update the session with the new user data if needed
    req.session.user = { ...req.session.user, firstname, middlename, lastname, email, profilepic };

    console.log('Profile updated successfully for user:', id);

    res.redirect('/profile');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Update Status
app.post('/update-status', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const { applicationId, status } = req.body; // Capture application ID and new status from the form

  try {
    // Update the status of the specific registration in the database
    const { data: registration, error: updateStatusError } = await supabase
      .from('ncc_registrations')
      .update({ status })
      .eq('id', applicationId)
      .select('*')
      .single(); // Fetch the updated registration to get the submittedby value

    if (updateStatusError) {
      console.error('Error updating status:', updateStatusError.message);
      return res.status(500).send('Error updating status');
    }

    console.log('Registration updated:', registration);

    // Check if status is 4, indicating the need to update the user's registered column and insert into athletes table
    if (status == 4) {
      const { submittedby, firstname, middlename, lastname, gender, bday, phonenum, email, lastpromo, promolocation, clubregion, clubname, beltlevel, instructorfirstname, instructormi, instructorlastname, instructormobile, instructoremail } = registration;

      console.log('Updating user with username:', submittedby);

      // Update the corresponding user's registered column to true
      const { data: user, error: updateUserError } = await supabase
        .from('users')
        .update({ registered: true })
        .eq('username', submittedby)
        .select('*')
        .single();

      if (updateUserError) {
        console.error('Error updating user:', updateUserError.message);
        return res.status(500).send('Error updating user');
      }

      console.log('User updated:', user);

      // Insert the relevant data into the athletes table
      const { error: insertAthleteError } = await supabase
        .from('athletes')
        .insert([{
          firstname,
          middlename,
          lastname,
          gender,
          bday,
          phonenum,
          email,
          lastpromo,
          promolocation,
          clubregion,
          clubname,
          beltlevel,
          instructorfirstname,
          instructormi,
          instructorlastname,
          instructormobile,
          instructoremail
        }]);

      if (insertAthleteError) {
        console.error('Error inserting athlete:', insertAthleteError.message);
        return res.status(500).send('Error inserting athlete');
      }

      console.log('Athlete inserted successfully');
    }

    res.redirect(`/membership-review/${applicationId}`); // Redirect back to the review page
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Add Comment
app.post('/add-comment', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const { threadid, comment } = req.body;
  const commenter = req.session.user.username;

  try {
    // Insert the new comment into the database
    const { error } = await supabase
      .from('forum_comments')
      .insert([{
        threadid,
        commenter,
        comment
      }]);

    if (error) {
      console.error('Error inserting comment:', error.message);
      return res.status(500).send('Error inserting comment');
    }

    res.redirect(`/forum-thread/${threadid}`);
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// VIEWS BELOW
// Create Event Route
app.get('/create-event', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.render('create-event', { user: req.session.user });
});

app.post('/create-event', async (req, res) => {
  const { title, description, eventpicture, date, time, location, rank, age } = req.body;

  try {
    const { data, error } = await supabase
      .from('events')
      .insert([{ title, description, eventpicture, date, time, location, rank, age }]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.redirect('/events');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Event Details Route
app.get('/event-details/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.render('event-details', { event: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Home Route
app.get('/home', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data, error } = await supabase
      .from('events')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the home.hbs template with both the fetched data and the session user data
    res.render('home', { events: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/forum', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data, error } = await supabase
      .from('forum_threads')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the forum.hbs template with the fetched data
    res.render('forum', { forum_threads: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/forum-create', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data, error } = await supabase
      .from('forum_threads')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the forum.hbs template with the fetched data
    res.render('forum-create', { forum_threads: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/forum-thread/:id', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const threadId = req.params.id;

  try {
    // Fetch the specific thread data
    const { data: thread, error: threadError } = await supabase
      .from('forum_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (threadError) {
      return res.status(400).json({ error: threadError.message });
    }

    console.log("Fetched thread data:", thread); // Log the data to the console

    // Fetch the comments for this thread
    const { data: comments, error: commentsError } = await supabase
      .from('forum_comments')
      .select('*')
      .eq('threadid', threadId);

    if (commentsError) {
      return res.status(400).json({ error: commentsError.message });
    }

    console.log("Fetched comments data:", comments); // Log the data to the console

    // Render the forum-thread.hbs template with the fetched data
    res.render('forum-thread', { thread, comments, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/clubs', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data, error } = await supabase
      .from('clubs')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the forum.hbs template with the fetched data
    res.render('clubs', { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/membership', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data, error } = await supabase
      .from('clubs')                                            //need to change to clubs after
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the forum.hbs template with the fetched data
    res.render('membership', { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message, user: req.session.user });
  }
});

app.get('/events', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data, error } = await supabase
      .from('events')                                            //need to change to clubs after
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the forum.hbs template with the fetched data
    res.render('events', { events: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/profile', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  res.render('profile', { user: req.session.user });
});

app.get('/athletes', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }
  
  try {
    const { data, error } = await supabase
      .from('athletes')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the athletes.hbs template with the fetched data
    res.render('athletes', { athletes: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/notifications', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }
  
  try {
    const { data, error } = await supabase
      .from('athletes')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the athletes.hbs template with the fetched data
    res.render('notifications', { athletes: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/membership-ncc', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data, error } = await supabase
      .from('clubs')
      .select('*');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the athletes.hbs template with the fetched data
    res.render('membership-ncc', { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/membership-status', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const username = req.session.user.username; // Or use a unique identifier like user ID
  const usertype = req.session.user.usertype;

  try {
    let data;
    let error;

    if (usertype === 'pta') {
      // Fetch all rows if user is 'pta'
      ({ data, error } = await supabase
        .from('ncc_registrations')
        .select('*'));
    } else {
      // Fetch only rows submitted by the current user
      ({ data, error } = await supabase
        .from('ncc_registrations')
        .select('*')
        .eq('submittedby', username));
    }

    if (error) {
      console.error('Error fetching data:', error.message);
      return res.status(500).send('Error fetching data');
    }

    res.render('membership-status', { ncc_registrations: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/membership-review/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase
      .from('ncc_registrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching registration:', error.message);
      return res.status(500).send('Error fetching registration');
    }

    // Render the membership-review.hbs template with the fetched data
    res.render('membership-review', { registration: data , user: req.session.user });
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

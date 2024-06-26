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
const PAYMONGO_PUBLIC_KEY = 'pk_test_tfhdABT3Jvix9Wvsbv5AGP6d ';

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
          amount: amount * 100, // PayMongo expects the amount in cents
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
};

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

async function checkAndRemoveOldRegistrations() {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  try {
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

hbs.registerHelper('renderComments', function(comments, options) {
  function renderNestedComments(comments, parentId) {
    let out = '<ul>';
    comments.filter(comment => comment.parentid === parentId).forEach(comment => {
      out += '<li>' + options.fn(comment);
      const childComments = comments.filter(c => c.parentid === comment.id);
      if (childComments.length) {
        out += renderNestedComments(comments, comment.id);
      }
      out += '</li>';
    });
    out += '</ul>';
    return out;
  }

  return renderNestedComments(comments, null);
});

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
  try {
    const { data: users, error: usersError } = await supabase.from('users').select('*');
    if (usersError) {
      return res.status(400).json({ error: usersError.message });
    }
    const { data: athletes, error: athletesError } = await supabase.from('athletes').select('*');
    if (athletesError) {
      return res.status(400).json({ error: athletesError.message });
    }
    console.log("Fetched users data:", users);
    console.log("Fetched athletes data:", athletes);
    res.render('index', { users, athletes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/data/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/submit-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data, error } = await supabase.from('users').select('*').eq('username', username).eq('password', password).single();
    if (error || !data) {
      return res.status(401).render('index', {
        error: 'Invalid username or password.',
        users: [],
        athletes: []
      });
    }
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
    res.redirect('/home');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/submit-signup', async (req, res) => {
  const { username, password, confpassword } = req.body;
  if (password !== confpassword) {
    return res.status(400).render('index', {
      error: 'Passwords do not match.',
      users: []
    });
  }
  try {
    const { data, error } = await supabase.from('users').insert([{ username, password }]);
    if (error) {
      return res.status(500).render('index', {
        error: 'Error creating user.',
        users: []
      });
    }
    res.redirect('/');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
  } = req.body;
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  const submittedby = req.session.user.username;
  const status = 1;

  try {
    const { data, error } = await supabase.from('ncc_registrations').insert([{
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
      submittedby
    }]);
    if (error) {
      return res.status(500).render('membership', {
        error: 'Error creating registration.',
        users: []
      });
    }
    res.redirect('/membership');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-post', async (req, res) => {
  const { title, topic, body } = req.body;
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  const originalposter = req.session.user.username;
  const upvotes = 0, downvotes=0;

  try {
    const { data, error } = await supabase.from('forum_threads').insert([{
      title,
      originalposter,
      topic,
      body,
      upvotes,
      downvotes
    }]);
    if (error) {
      return res.status(500).render('forum', {
        error: 'Error creating post.',
        users: []
      });
    }
    res.redirect('/forum');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
  } = req.body;
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  const id = req.session.user.id;
  let profilepic = req.session.user.profilepic;
  if (req.file) {
    try {
      const filePath = `profilepics/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage.from('profilepics').upload(filePath, req.file.buffer, {
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
    const { data, error } = await supabase.from('users').update({
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
    }).eq('id', id);
    if (error) {
      console.error('Error updating profile:', error.message);
      return res.status(500).render('home', {
        error: 'Error updating profile.',
        users: []
      });
    }
    req.session.user = { ...req.session.user, firstname, middlename, lastname, email, profilepic };
    console.log('Profile updated successfully for user:', id);
    res.redirect('/profile');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/update-status', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  const { applicationId, status } = req.body;

  try {
    const { data: registration, error: updateStatusError } = await supabase
      .from('ncc_registrations')
      .update({ status })
      .eq('id', applicationId)
      .select('*')
      .single();

    if (updateStatusError) {
      console.error('Error updating status:', updateStatusError.message);
      return res.status(500).send('Error updating status');
    }

    console.log('Registration updated:', registration);

    if (status == 4) {
      const {
        submittedby,
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
      } = registration;

      console.log('Updating user with username:', submittedby);

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

      const { error: insertAthleteError } = await supabase.from('athletes').insert([{
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

    res.redirect(`/membership-review/${applicationId}`);
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/add-comment', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  const { threadid, comment, parentid } = req.body;
  const commenter = req.session.user.username;
  try {
    const { error } = await supabase.from('forum_comments').insert([{
      threadid,
      parentid: parentid === 'null' ? null : parentid,
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

app.get('/home', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }
  try {
    const { data, error } = await supabase.from('events').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data, error } = await supabase.from('forum_threads').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data, error } = await supabase.from('forum_threads').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data: thread, error: threadError } = await supabase
      .from('forum_threads')
      .select('*')
      .eq('id', threadId)
      .single();
    if (threadError) {
      return res.status(400).json({ error: threadError.message });
    }
    console.log("Fetched thread data:", thread);
    const { data: comments, error: commentsError } = await supabase
      .from('forum_comments')
      .select('*')
      .eq('threadid', threadId);
    if (commentsError) {
      return res.status(400).json({ error: commentsError.message });
    }
    console.log("Fetched comments data:", comments);
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
    const { data, error } = await supabase.from('clubs').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data, error } = await supabase.from('clubs').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data, error } = await supabase.from('events').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data, error } = await supabase.from('athletes').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data, error } = await supabase.from('athletes').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
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
    const { data, error } = await supabase.from('clubs').select('*');
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    console.log("Fetched data:", data);
    res.render('membership-ncc', { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/membership-status', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }
  const username = req.session.user.username;
  const usertype = req.session.user.usertype;

  try {
    let data;
    let error;
    if (usertype === 'pta') {
      ({ data, error } = await supabase.from('ncc_registrations').select('*'));
    } else {
      ({ data, error } = await supabase.from('ncc_registrations').select('*').eq('submittedby', username));
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
    const { data, error } = await supabase.from('ncc_registrations').select('*').eq('id', id).single();
    if (error) {
      console.error('Error fetching registration:', error.message);
      return res.status(500).send('Error fetching registration');
    }
    res.render('membership-review', { registration: data, user: req.session.user });
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).send('Server error');
  }
});

app.post('/create-event', async (req, res) => {
  const { title, description, eventpicture, date, time, location, rankRequirement, ageRequirement } = req.body;
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  try {
    const { data, error } = await supabase.from('events').insert([{ title, description, eventpicture, date, time, location, rankRequirement, ageRequirement }]);
    if (error) {
      console.error('Error creating event:', error.message);
      return res.status(500).send('Error creating event');
    }
    res.redirect('/events');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).send('Server error');
  }
});

app.get('/event-details/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
    if (error) {
      console.error('Error fetching event:', error.message);
      return res.status(500).send('Error fetching event');
    }
    res.render('event-details', { event: data, user: req.session.user });
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
<<<<<<< Updated upstream
=======

// Route to render create event page
app.get('/create-event', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.render('create-event', { user: req.session.user });
});

// Route to handle create event form submission
app.post('/create-event', async (req, res) => {
  const { title, date, time, description, eventpicture } = req.body;

  try {
    const { data, error } = await supabase
      .from('events')
      .insert([{
        title,
        date,
        time,
        description,
        eventpicture
      }]);

    if (error) {
      console.error('Error creating event:', error.message);
      return res.status(500).render('create-event', {
        error: 'Error creating event.',
        user: req.session.user
      });
    }

    res.redirect('/events');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
>>>>>>> Stashed changes

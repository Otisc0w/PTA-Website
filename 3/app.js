const express = require('express');
const path = require('path');
const multer = require('multer');
const hbs = require('hbs');
const session = require('express-session'); // Import express-session
const app = express();
const cron = require('node-cron');
const axios = require('axios');

// Replace these with your actual API keys from PayMongo
const PAYMONGO_SECRET_KEY = 'sk_test_rfwrr7CgVzNP4AnGJcjU6yFa';
const PAYMONGO_PUBLIC_KEY = 'pk_test_tfhdABT3Jvix9Wvsbv5AGP6d ';

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
hbs.registerHelper('me', function (a, b) {
  return a >= b;
});
hbs.registerHelper('ne', function (a, b) {
  return a !== b;
});
hbs.handlebars.registerHelper('or', function (a, b) {
  return a || b;
});
hbs.handlebars.registerHelper('and', function (a, b) {
  return a && b;
});
hbs.registerHelper('arraySize', function(array) {
  return array.length;
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
hbs.registerHelper('formatStatus', function(status) {
  switch (status) {
      case 1:
          return '<span class="status-under-review">Under Review</span>';
      case 2:
          return '<span class="status-printed">Printed</span>';
      case 3:
          return '<span class="status-en-route">En-route to Regional Office</span>';
      case 4:
          return '<span class="status-shipped">ID Shipped</span>';
      case 5:
          return '<span class="status-rejected">Reject Application</span>';
      default:
          return '<span class="status-unknown">Unknown Status</span>';
  }
});

app.use(session({
  secret: 'your_secret_key', // Replace with a secure secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

async function createMatches(eventid, registrations) {
  // Create pairs for matches
  function createKnockoutPairs(registrations) {
    const pairs = [];
    for (let i = 0; i < registrations.length; i += 2) {
      if (registrations[i + 1]) {
        pairs.push([registrations[i], registrations[i + 1]]);
      } else {
        pairs.push([registrations[i]]); // Handle odd number of participants
      }
    }
    return pairs;
  }

  const pairs = createKnockoutPairs(registrations);
  const round = 1;
  // Store matches in the database
  for (const pair of pairs) {
    const { error } = await supabase
      .from('matches')
      .insert([{ eventid, player1: pair[0].userid, player2: pair[1]?.userid, round }]);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function createNextRound(eventid) {
  // Fetch the highest round number for the event
  const { data: highestRound, error: roundError } = await supabase
    .from('matches')
    .select('round')
    .eq('eventid', eventid)
    .order('round', { ascending: false })
    .limit(1)
    .single();

  if (roundError) {
    console.error('Error fetching highest round:', roundError.message);
    return;
  }

  const currentRound = highestRound ? highestRound.round : 0;

  // Fetch all matches for the current round
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .eq('eventid', eventid)
    .eq('round', currentRound);

  if (matchesError) {
    console.error('Error fetching matches:', matchesError.message);
    return;
  }

  // Check if all matches in the current round are completed
  const allMatchesCompleted = matches.every(match => match.winner !== null);
  if (!allMatchesCompleted) {
    console.log('Not all matches are completed.');
    return;
  }

  // Fetch all winners from the current round
  const winners = matches.map(match => match.winner).filter(winner => winner !== 0);

  // If there's only one winner left, declare them the champion
  if (winners.length === 1) {
    const champion = winners[0];

    try {
      // Update the event to set the champion
      const { error: eventError } = await supabase
        .from('events')
        .update({ champion })
        .eq('id', eventid);

      if (eventError) {
        console.error('Error declaring champion:', eventError.message);
      } else {
        console.log('Champion declared:', champion);
      }
    } catch (error) {
      console.error('Server error:', error.message);
    }

    return;
  }

  // Pair winners for the next round
  const pairs = createPairs(winners);

  // Insert the next round matches into the database
  const nextRound = currentRound + 1;
  for (const pair of pairs) {
    const { error } = await supabase
      .from('matches')
      .insert([{ eventid, player1: pair[0], player2: pair[1] || null, round: nextRound }]);

    if (error) {
      console.error('Error creating next round match:', error.message);
    }
  }

  console.log('Next round matches created.');
}

function createPairs(winners) {
  const pairs = [];
  for (let i = 0; i < winners.length; i += 2) {
    pairs.push([winners[i], winners[i + 1] || null]); // Handle odd number of winners
  }
  return pairs;
}


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

// SUBMIT STUFF
app.post('/submit-login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password) //blue is from form and red is column in databse
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
      club: data.club,
      region: data.region,
      profilepic: data.profilepic,
      athleteverified: data.athleteverified,
      instructorverified: data.instructorverified,
      ptaverified: data.ptaverified
    };

    // Successful login
    res.redirect('/home');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/submit-signup', async (req, res) => {
  const { username, password, confpassword } = req.body; // Capture user input from the form

  // Validate the input
  if (password !== confpassword) {
    return res.status(400).render('index', {
      error: 'Passwords do not match.',
      users: [] // Optionally pass users array if you need it in the view
    });
  }

  const athleteverified = false;
  const instructorverified = false;
  const ptaverified = false;
  

  try {
    // Insert the new user into the database
    const { data, error } = await supabase
      .from('users') // Replace 'users' with your actual table name if different
      .insert([{ username, password, athleteverified, instructorverified, ptaverified }]);

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

app.post('/submit-ncc', upload.fields([{ name: 'birthcert', maxCount: 1 }, { name: 'portrait', maxCount: 1 }]), async (req, res) => {
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

  const submittedby = req.session.user.id; // Get the current user's username from the session
  const status = 1;

  let birthcertUrl = null;
  let portraitUrl = null;

  if (req.files) {
    try {
      if (req.files.birthcert) {
        const birthcertPath = `documents/${Date.now()}-${req.files.birthcert[0].originalname}`;
        const { error: birthcertUploadError } = await supabase
          .storage
          .from('documents')
          .upload(birthcertPath, req.files.birthcert[0].buffer, {
            contentType: req.files.birthcert[0].mimetype,
          });

        if (birthcertUploadError) {
          console.error('Error uploading birth certificate:', birthcertUploadError.message);
          return res.status(500).send('Error uploading birth certificate');
        }

        birthcertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${birthcertPath}`;
      }

      if (req.files.portrait) {
        const portraitPath = `documents/${Date.now()}-${req.files.portrait[0].originalname}`;
        const { error: portraitUploadError } = await supabase
          .storage
          .from('documents')
          .upload(portraitPath, req.files.portrait[0].buffer, {
            contentType: req.files.portrait[0].mimetype,
          });

        if (portraitUploadError) {
          console.error('Error uploading portrait:', portraitUploadError.message);
          return res.status(500).send('Error uploading portrait');
        }

        portraitUrl = `${supabaseUrl}/storage/v1/object/public/documents/${portraitPath}`;
      }
    } catch (error) {
      console.error('Server error during file upload:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

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
        beltlevel,
        instructorfirstname,
        instructormi,
        instructorlastname,
        instructormobile,
        instructoremail,
        status,
        submittedby,
        birthcert: birthcertUrl, // Include the birth certificate URL
        portrait: portraitUrl // Include the portrait URL
      }]);

    if (error) {
      console.error('Error creating registration:', error.message);
      return res.status(500).render('membership', {
        error: 'Error creating registration.',
        users: [] // Optionally pass users array if you need it in the view
      });
    }
    res.redirect('/membership');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/submit-instructor', upload.fields([{ name: 'birthcert', maxCount: 1 }, { name: 'portrait', maxCount: 1 }, { name: 'educproof', maxCount: 1 }, { name: 'poomsaecert', maxCount: 1 }, { name: 'kukkiwoncert', maxCount: 1 }, { name: 'ptablackbeltcert', maxCount: 1 }]), async (req, res) => {
  const {
    apptype,
    firstname,
    middlename,
    lastname,
    gender,
    bday,
    phonenum,
    email,
    clubregion,
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const submittedby = req.session.user.id; // Get the current user's username from the session
  const status = 1;

  let birthcertUrl = null;
  let portraitUrl = null;
  let educproofUrl = null;
  let poomsaecertUrl = null;
  let kukkiwoncertUrl = null;
  let ptablackbeltcertUrl = null;

  if (req.files) {
    try {
      if (req.files.birthcert) {
        const birthcertPath = `documents/${Date.now()}-${req.files.birthcert[0].originalname}`;
        const { error: birthcertUploadError } = await supabase
          .storage
          .from('documents')
          .upload(birthcertPath, req.files.birthcert[0].buffer, {
            contentType: req.files.birthcert[0].mimetype,
          });

        if (birthcertUploadError) {
          console.error('Error uploading birth certificate:', birthcertUploadError.message);
          return res.status(500).send('Error uploading birth certificate');
        }

        birthcertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${birthcertPath}`;
      }

      if (req.files.portrait) {
        const portraitPath = `documents/${Date.now()}-${req.files.portrait[0].originalname}`;
        const { error: portraitUploadError } = await supabase
          .storage
          .from('documents')
          .upload(portraitPath, req.files.portrait[0].buffer, {
            contentType: req.files.portrait[0].mimetype,
          });

        if (portraitUploadError) {
          console.error('Error uploading portrait:', portraitUploadError.message);
          return res.status(500).send('Error uploading portrait');
        }

        portraitUrl = `${supabaseUrl}/storage/v1/object/public/documents/${portraitPath}`;
      }

      if (req.files.educproof) {
        const educproofPath = `documents/${Date.now()}-${req.files.educproof[0].originalname}`;
        const { error: educproofUploadError } = await supabase
          .storage
          .from('documents')
          .upload(educproofPath, req.files.educproof[0].buffer, {
            contentType: req.files.educproof[0].mimetype,
          });

        if (educproofUploadError) {
          console.error('Error uploading educproof:', educproofUploadError.message);
          return res.status(500).send('Error uploading educproof');
        }

        educproofUrl = `${supabaseUrl}/storage/v1/object/public/documents/${educproofPath}`;
      }

      if (req.files.poomsaecert) {
        const poomsaecertPath = `documents/${Date.now()}-${req.files.poomsaecert[0].originalname}`;
        const { error: poomsaecertUploadError } = await supabase
          .storage
          .from('documents')
          .upload(poomsaecertPath, req.files.poomsaecert[0].buffer, {
            contentType: req.files.poomsaecert[0].mimetype,
          });

        if (poomsaecertUploadError) {
          console.error('Error uploading poomsaecert:', poomsaecertUploadError.message);
          return res.status(500).send('Error uploading poomsaecert');
        }

        poomsaecertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${poomsaecertPath}`;
      }

      if (req.files.kukkiwoncert) {
        const kukkiwoncertPath = `documents/${Date.now()}-${req.files.kukkiwoncert[0].originalname}`;
        const { error: kukkiwoncertUploadError } = await supabase
          .storage
          .from('documents')
          .upload(kukkiwoncertPath, req.files.kukkiwoncert[0].buffer, {
            contentType: req.files.kukkiwoncert[0].mimetype,
          });

        if (kukkiwoncertUploadError) {
          console.error('Error uploading kukkiwoncert:', kukkiwoncertUploadError.message);
          return res.status(500).send('Error uploading kukkiwoncert');
        }

        kukkiwoncertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${kukkiwoncertPath}`;
      }

      if (req.files.ptablackbeltcert) {
        const ptablackbeltcertPath = `documents/${Date.now()}-${req.files.ptablackbeltcert[0].originalname}`;
        const { error: ptablackbeltcertUploadError } = await supabase
          .storage
          .from('documents')
          .upload(ptablackbeltcertPath, req.files.ptablackbeltcert[0].buffer, {
            contentType: req.files.ptablackbeltcert[0].mimetype,
          });

        if (ptablackbeltcertUploadError) {
          console.error('Error uploading ptablackbeltcert:', ptablackbeltcertUploadError.message);
          return res.status(500).send('Error uploading ptablackbeltcert');
        }

        ptablackbeltcertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${ptablackbeltcertPath}`;
      }
    } catch (error) {
      console.error('Server error during file upload:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    // Insert the new user into the database
    const { data, error } = await supabase
      .from('instructor_registrations')
      .insert([{
        apptype,
        firstname,
        middlename,
        lastname,
        gender,
        bday,
        phonenum,
        email,
        clubregion,
        status,
        submittedby,
        birthcert: birthcertUrl, // Include the birth certificate URL
        portrait: portraitUrl, // Include the portrait URL
        educproof: educproofUrl,
        poomsaecert: poomsaecertUrl,
        kukkiwoncert: kukkiwoncertUrl,
        ptablackbeltcert: ptablackbeltcertUrl
      }]);

    if (error) {
      console.error('Error creating registration:', error.message);
      return res.status(500).render('membership', {
        error: 'Error creating registration.',
        users: [] // Optionally pass users array if you need it in the view
      });
    }
    res.redirect('/membership');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-post', async (req, res) => {
  const {
    title,
    topicid,
    body,
    profilepic
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  
  const originalposter = req.session.user.username; // Get the current user's id from the session
  const upvotes = [], downvotes =[];

  try {
    // Fetch the topic from the forum_topics table using the topicid
    const { data: topicData, error: topicError } = await supabase
      .from('forum_topics')
      .select('topic')
      .eq('id', topicid)
      .single();

    if (topicError) {
      // Handle any errors that occur during the topic fetch
      console.error('Error fetching topic:', topicError.message);
      return res.status(500).send('Error fetching topic');
    }

    const topic = topicData.topic; // Extract the topic value

    // Insert the new forum thread into the forum_threads table
    const { data, error } = await supabase
      .from('forum_threads') 
      .insert([{
        title,
        originalposter,
        topic,
        topicid,
        body,
        upvotes,
        downvotes,
        profilepic
      }]);

    if (error) {
      // Handle any errors that occur during the insert
      console.error('Error creating post:', error.message);
      return res.status(500).render('forum', {
        error: 'Error creating post.',
        users: [] // Optionally pass users array if you need it in the view
      });
    }

    res.redirect('/forum');
  } catch (error) {
    // Handle any server-side errors
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-topic', async (req, res) => {
  const {
    topic,
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  try {
    // Update the user in the database
    const { data, error } = await supabase
      .from('forum_topics') 
      .insert([{
        topic
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

app.post('/save-profile-changes', upload.single('file'), async (req, res) => {
  const {
    firstname,
    middlename,
    lastname,
    username,
    email,
    password,
    region,
    athleteverified,
    instructorverified,
    ptaverified,
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
      .from('users') // Replace 'users' with your actual table name if different
      .update({
        firstname,
        middlename,
        lastname,
        username,
        email,
        password,
        region,
        athleteverified,
        instructorverified,
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

app.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const id = req.session.user.id;

  try {
    // Validate current password (implementation depends on how passwords are stored)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (userError || !user || user.password !== currentPassword) {
      return res.status(401).send('Incorrect current password');
    }

    // Update the user's password in the database
    const { data, error } = await supabase
      .from('users')
      .update({
        password: newPassword
      })
      .eq('id', id);

    if (error) {
      console.error('Error changing password:', error.message);
      return res.status(500).send('Error changing password');
    }

    res.status(200).send('Password changed successfully');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/update-nccstatus', async (req, res) => {
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
    
    

    // Check if status is 4, indicating the need to update the user's athleteverified column and insert into athletes table
    if (status == 4) {
      const {
        firstname, middlename, lastname, gender, bday, clubregion, club,
        beltlevel, portrait, division,
        height, weight, submittedby, instructorfirstname, instructorlastname
      } = registration;

      console.log('Updating user with username:', submittedby);

      // Update the corresponding user's registered column to true
      const { data: user, error: updateUserError } = await supabase
        .from('users')
        .update({ athleteverified: true })
        .eq('id', submittedby)
        .select('*')
        .single();

      if (updateUserError) {
        console.error('Error updating user:', updateUserError.message);
        return res.status(500).send('Error updating user');
      }
      
      console.log('User updated:', user);
      const name= firstname + ' ' + middlename + ' ' + lastname;
      const instructor = instructorfirstname + ' ' + instructorlastname;
      
      userid = submittedby;

      // Insert the relevant data into the athletes table
      const { error: insertAthleteError } = await supabase
        .from('athletes')
        .insert([{
          name, gender, bday, clubregion, club,
          beltlevel, portrait, division,
          height, weight, instructor, userid
        }]);

      if (insertAthleteError) {
        console.error('Error inserting athlete:', insertAthleteError.message);
        return res.status(500).send('Error inserting athlete');
      }

      console.log('Athlete inserted successfully');

      // Store athlete data in session
      req.session.athlete = {
        firstname, middlename, lastname, gender, bday, clubregion, club,
          beltlevel, portrait, division,
          height, weight,
      };
    }

    res.redirect(`/membership-review/${applicationId}`); // Redirect back to the review page
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/update-instructorstatus', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const { applicationId, status } = req.body; // Capture application ID and new status from the form

  try {
    // Update the status of the specific registration in the database
    const { data: registration, error: updateStatusError } = await supabase
      .from('instructor_registrations')
      .update({ status })
      .eq('id', applicationId)
      .select('*')
      .single(); // Fetch the updated registration to get the submittedby value

    if (updateStatusError) {
      console.error('Error updating status:', updateStatusError.message);
      return res.status(500).send('Error updating status');
    }

    console.log('Registration updated:', registration);
    
    

    // Check if status is 4, indicating the need to update the user's athleteverified column and insert into athletes table
    if (status == 4) {
      const {
         submittedby
      } = registration;

      console.log('Updating user with username:', submittedby);

      // Update the corresponding user's registered column to true
      const { data: user, error: updateUserError } = await supabase
        .from('users')
        .update({ instructorverified: true })
        .eq('id', submittedby)
        .select('*')
        .single();

      if (updateUserError) {
        console.error('Error updating user:', updateUserError.message);
        return res.status(500).send('Error updating user');
      }

      console.log('Athlete inserted successfully');
    }

    res.redirect(`/instructor-review/${applicationId}`); // Redirect back to the review page
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/update-clubstatus', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const { applicationId, status } = req.body; // Capture application ID and new status from the form

  try {
    // Update the status of the specific registration in the database
    const { data: clubregistration, error: updateStatusError } = await supabase
      .from('club_registrations')
      .update({ status })
      .eq('id', applicationId)
      .select('*')
      .single(); // Fetch the updated registration to get the submittedby value

    if (updateStatusError) {
      console.error('Error updating status:', updateStatusError.message);
      return res.status(500).send('Error updating status');
    }

    console.log('Registration updated:', clubregistration);

    // Check if status is 4, indicating the need to update the user's athleteverified column and insert into athletes table
    if (status == 4) {
      const { firstname,
        lastname,
        phonenum,
        email,
        clubname,
        clubaddress,
        province,
        submittedby,
        clubpic } = clubregistration;

      console.log('Updating user with username:', submittedby);

      const registeredby = submittedby;
      const registeree= firstname + ' ' + lastname;

      const { error: insertClubError } = await supabase
        .from('clubs')
        .insert([{
          clubname,
          phonenum,
          email,
          clubaddress,
          province,
          registeredby,
          registeree,
          clubpic
        }]);

      if (insertClubError) {
        console.error('Error inserting athlete:', insertClubError.message);
        return res.status(500).send('Error inserting club');
      }

      console.log('Club inserted successfully');
    }

    res.redirect(`/clubreg-review/${applicationId}`); // Redirect back to the review page
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
    // Insert the new comment into the database
    const { error } = await supabase
      .from('forum_comments')
      .insert([{
        threadid,
        parentid: parentid === 'null' ? null : parentid, // Handle replies
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

app.post('/submit-club', upload.fields([
  { name: 'idfile', maxCount: 1 },
  { name: 'proofdoc', maxCount: 1 },
  { name: 'clubpic', maxCount: 1 }
]), async (req, res) => {
  const {
    firstname,
    lastname,
    phonenum,
    email,
    clubname,
    clubaddress,
    province
  } = req.body; // Capture user input from the form

  const status = 1;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const submittedby = req.session.user.id; // Get the current user's username from the session

  let idfileUrl = '';
  let proofdocUrl = '';
  let clubpicUrl = '';

  console.log('Files received:', req.files);

  if (req.files) {
    try {
      if (req.files.idfile) {
        const idfilePath = `documents/${Date.now()}-${req.files.idfile[0].originalname}`;
        console.log('Uploading ID file:', idfilePath);
        const { error: idfileError } = await supabase
          .storage
          .from('documents')
          .upload(idfilePath, req.files.idfile[0].buffer, {
            contentType: req.files.idfile[0].mimetype,
          });

        if (idfileError) {
          console.error('Error uploading ID file:', idfileError.message);
          return res.status(500).send('Error uploading ID file');
        }

        idfileUrl = `${supabaseUrl}/storage/v1/object/public/documents/${idfilePath}`;
        console.log('ID file uploaded to:', idfileUrl);
      }

      if (req.files.proofdoc) {
        const proofdocPath = `documents/${Date.now()}-${req.files.proofdoc[0].originalname}`;
        console.log('Uploading proof document:', proofdocPath);
        const { error: proofdocError } = await supabase
          .storage
          .from('documents')
          .upload(proofdocPath, req.files.proofdoc[0].buffer, {
            contentType: req.files.proofdoc[0].mimetype,
          });

        if (proofdocError) {
          console.error('Error uploading proof document:', proofdocError.message);
          return res.status(500).send('Error uploading proof document');
        }

        proofdocUrl = `${supabaseUrl}/storage/v1/object/public/documents/${proofdocPath}`;
        console.log('Proof document uploaded to:', proofdocUrl);
      }

      if (req.files.clubpic) {
        const clubpicPath = `documents/${Date.now()}-${req.files.clubpic[0].originalname}`;
        console.log('Uploading club picture:', clubpicPath);
        const { error: clubpicError } = await supabase
          .storage
          .from('documents')
          .upload(clubpicPath, req.files.clubpic[0].buffer, {
            contentType: req.files.clubpic[0].mimetype,
          });

        if (clubpicError) {
          console.error('Error uploading club picture:', clubpicError.message);
          return res.status(500).send('Error uploading club picture');
        }

        clubpicUrl = `${supabaseUrl}/storage/v1/object/public/documents/${clubpicPath}`;
        console.log('Club picture uploaded to:', clubpicUrl);
      }
    } catch (error) {
      console.error('Server error during file upload:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  console.log('ID File URL:', idfileUrl);
  console.log('Proof Document URL:', proofdocUrl);
  console.log('Club Picture URL:', clubpicUrl);

  try {
    // Insert the new club registration into the database
    const { data, error } = await supabase
      .from('club_registrations') // Replace 'club_registrations' with your actual table name if different
      .insert([{
        firstname,
        lastname,
        phonenum,
        email,
        clubname,
        clubaddress,
        province,
        idfile: idfileUrl,
        proofdoc: proofdocUrl,
        clubpic: clubpicUrl, // Include the club picture URL
        submittedby,
        status
      }])
      .select(); // Ensure the data is returned

    if (error) {
      console.error('Error inserting club registration:', error.message);
      return res.status(500).send('Error inserting club registration');
    }

    console.log('Club registration submitted successfully:', data);

    res.redirect('membership'); // Redirect to a success page or another appropriate route
  } catch (error) {
    console.error('Server error during database insertion:', error.message);
    res.status(500).json({ error: error.message });
  }
});
                                     
app.post('/invite-user', async (req, res) => {
  const { club_id, invited_user, clubname } = req.body;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const inviter_user = req.session.user.username;
  const invitername = req.session.user.firstname + req.session.user.lastname;

  try {
    const { data, error } = await supabase
      .from('club_invitations')
      .insert([{ club_id, clubname, invited_user, inviter_user, invitername}]);

    if (error) {
      console.error('Error inviting user:', error.message);
      return res.status(500).send('Error inviting user');
    }

    res.redirect(`/clubs-details/${club_id}`);
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/invite-player', async (req, res) => {
  const { userid, clubid } = req.body;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const inviter_user = req.session.user.id; // Get the current user's ID
  const invitername = req.session.user.firstname + req.session.user.lastname;
  const invited_user = userid;

  try {
    // Fetch the club name where the club ID is provided
    const { data: clubData, error: clubError } = await supabase
      .from('clubs')
      .select('clubname')
      .eq('id', clubid)
      .single();

    if (clubError) {
      return res.status(500).json({ error: clubError.message });
    }

    const clubname = clubData.clubname;
    const club_id = clubid;

    // Insert the invitation into the invitations table
    const { data, error } = await supabase
      .from('club_invitations')
      .insert([{ invited_user, inviter_user, club_id, clubname, invitername }]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.redirect('/athletes'); // Redirect back to the athletes page after inviting
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/accept-invitation/:id', async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const userid = req.session.user.id;

  try {
    // Fetch the invitation details to get the clubname
    const { data: invitation, error: fetchError } = await supabase
      .from('club_invitations')
      .select('*')
      .eq('id', id)
      .eq('invited_user', userid)
      .single();

    if (fetchError || !invitation) {
      console.error('Error fetching invitation:', fetchError ? fetchError.message : 'Invitation not found');
      return res.status(500).send('Error fetching invitation');
    }

    const clubname = invitation.clubname;

    // Update the invitation status to 'accepted'
    const { error: updateInvitationError } = await supabase
      .from('club_invitations')
      .update({ status: 'accepted' })
      .eq('id', id)
      .eq('invited_user', userid);

    if (updateInvitationError) {
      console.error('Error accepting invitation:', updateInvitationError.message);
      return res.status(500).send('Error accepting invitation');
    }

    // Update the club column in the users table
    const { error: updateUserError } = await supabase
      .from('athletes')
      .update({ club: clubname })
      .eq('userid', userid);

    if (updateUserError) {
      console.error('Error updating user club:', updateUserError.message);
      return res.status(500).send('Error updating user club');
    }

    // Update the session with the new club
    req.session.user.club = clubname;

    res.redirect('/notifications');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/reject-invitation/:id', async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const userid = req.session.user.id;

  try {
    const { data, error } = await supabase
      .from('club_invitations')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('invited_user', userid);

    if (error) {
      console.error('Error rejecting invitation:', error.message);
      return res.status(500).send('Error rejecting invitation');
    }

    res.redirect('/notifications');
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/vote', async (req, res) => {
  const { type, threadId } = req.body;

  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No user logged in' });
  }

  const userId = req.session.user.id;

  try {
    // Fetch the current thread
    const { data: thread, error: threadError } = await supabase
      .from('forum_threads')
      .select('upvotes, downvotes')
      .eq('id', threadId)
      .single();

    if (threadError) {
      return res.status(500).json({ success: false, message: threadError.message });
    }

    let upvotes = thread.upvotes || [];
    let downvotes = thread.downvotes || [];

    // Check if the user has already upvoted or downvoted
    const hasUpvoted = upvotes.includes(userId);
    const hasDownvoted = downvotes.includes(userId);

    // Remove user from both arrays to ensure clean state
    upvotes = upvotes.filter(id => id !== userId);
    downvotes = downvotes.filter(id => id !== userId);

    // Add user to the appropriate array based on vote type, or remove if they already voted
    if (type === 'upvote') {
      if (!hasUpvoted) {
        upvotes.push(userId);
      }
    } else if (type === 'downvote') {
      if (!hasDownvoted) {
        downvotes.push(userId);
      }
    }

    // Update the thread with the new arrays
    const { data, error } = await supabase
      .from('forum_threads')
      .update({ upvotes, downvotes })
      .eq('id', threadId)
      .select();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    res.redirect(`/forum-thread/${threadId}`); // Redirect back to the thread page
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/create-event', upload.single('eventpicture'), async (req, res) => {
  const {
    name,
    description,
    eventtype,
    registrationcap,
    date,
    starttime,
    endtime,
    location
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const createdby = req.session.user.username; // Get the current user's username from the session
  let eventpictureUrl = null;

  if (req.file) {
    try {
      const filePath = `eventpictures/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        console.error('Error uploading event picture:', uploadError.message);
        return res.status(500).send('Error uploading event picture');
      }

      eventpictureUrl = `${supabaseUrl}/storage/v1/object/public/documents/${filePath}`;
    } catch (error) {
      console.error('Server error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    // Insert the new event into the database
    const { data, error } = await supabase
      .from('events')
      .insert([{
        name,
        description,
        eventpicture: eventpictureUrl,
        eventtype,
        createdby,
        registrationcap,
        date,
        starttime,
        endtime,
        location
      }])
      .select(); // Ensure the data is returned

    if (error) {
      console.error('Error creating event:', error.message);
      return res.status(500).send('Error creating event');
    }

    console.log('Event created successfully:', data);

    res.redirect('/events'); // Redirect to a success page or another appropriate route
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/submit-player', async (req, res) => {
  const {
    athleteid,
    eventid,
    email,
    playername,
    club,
    age,
    bday,
    division,
    belt,
    height,
    weight,
    instructor
  } = req.body; // Capture user input from the form

  const registered ='false';
  const userid= req.session.user.id;

  try {
    // Insert the new registration into the database
    const { data: registrationData, error: registrationError } = await supabase
      .from('events_registrations')
      .insert([{
        athleteid,
        userid,
        eventid,
        registered,
        email,
        playername,
        club,
        age,
        bday,
        division,
        belt,
        height,
        weight,
        instructor
      }]);

    if (registrationError) {
      console.error('Error creating registration:', registrationError.message);
      return res.status(500).send('Error creating registration.');
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/begin-competition/:id', async (req, res) => {
  const { id: eventid } = req.params; // Get the event ID from the URL

  try {
    // Fetch the event registrations for the specific event
    const { data: eventregistrations, error: eventregistrationsError } = await supabase
      .from('events_registrations')
      .select('*')
      .eq('eventid', eventid);

    if (eventregistrationsError) {
      console.error('Error fetching event registrations:', eventregistrationsError.message);
      return res.status(500).send('Error fetching event registrations.');
    }

    // Fetch the event details to get the registration cap
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventid)
      .single();

    if (eventError) {
      console.error('Error fetching event details:', eventError.message);
      return res.status(500).send('Error fetching event details.');
    }

    // Check if the registration cap has been reached
    if (eventregistrations.length >= event.registrationcap) {
      await createMatches(eventid, eventregistrations); // Trigger match creation
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/update-eventreg-status', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const { applicationId, registered } = req.body; // Capture application ID and new status from the form

  try {
    // Update the status of the specific registration in the database
    const { data: registration, error: updateStatusError } = await supabase
      .from('events_registrations')
      .update({ registered })
      .eq('id', applicationId)
      .single();

    if (updateStatusError) {
      console.error('Error updating status:', updateStatusError.message);
      return res.status(500).send('Error updating status');
    }

    // Optionally, handle post-acceptance actions, like notifying the user or updating other related tables

    console.log('Registration updated:', registration);
    res.redirect(`/events-review-registration/${applicationId}`);
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/follow-topic/:id', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const userId = req.session.user.id;
  const topicId = req.params.id;

  try {
    // Fetch the current followers array
    const { data: topic, error: fetchError } = await supabase
      .from('forum_topics')
      .select('followers')
      .eq('id', topicId)
      .single();

    if (fetchError) {
      return res.status(500).send('Error fetching topic followers');
    }

    // Add the current user to the followers array if not already in it
    const updatedFollowers = topic.followers || [];
    if (!updatedFollowers.includes(userId)) {
      updatedFollowers.push(userId);
    }

    // Update the topic with the new followers array
    const { data, error: updateError } = await supabase
      .from('forum_topics')
      .update({ followers: updatedFollowers })
      .eq('id', topicId);

    if (updateError) {
      return res.status(500).send('Error following topic');
    }

    res.redirect('/forum');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/unfollow-topic/:id', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const userId = req.session.user.id;
  const topicId = req.params.id;

  try {
    // Fetch the current followers array
    const { data: topic, error: fetchError } = await supabase
      .from('forum_topics')
      .select('followers')
      .eq('id', topicId)
      .single();

    if (fetchError) {
      return res.status(500).send('Error fetching topic followers');
    }

    // Remove the current user from the followers array if present
    const updatedFollowers = (topic.followers || []).filter(follower => follower !== userId);

    // Update the topic with the new followers array
    const { data, error: updateError } = await supabase
      .from('forum_topics')
      .update({ followers: updatedFollowers })
      .eq('id', topicId);

    if (updateError) {
      return res.status(500).send('Error unfollowing topic');
    }

    res.redirect('/forum');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-announcement', async (req, res) => {
  const {
    title,
    subject,
    body,
    originalposter,
    profilepic,
    clubid
  } = req.body;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  try {
    const { data, error } = await supabase
      .from('club_announcements')
      .insert([{
        title,
        subject,
        body,
        originalposter,
        profilepic,
        clubid
      }]);

    if (error) {
      return res.status(500).render('announcements', {
        error: 'Error creating announcement.',
        user: req.session.user
      });
    }

    res.redirect(`/clubs-details/${clubid}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/submit-scores', async (req, res) => {
  const { matchid, player1_total, player2_total, eventid, player1, player2 } = req.body;

  const player1score = player1_total;
  const player2score = player2_total;

  // Determine the winner based on scores
  let winner;
  if (player1score > player2score) {
    winner = player1;
  } else if (player2score > player1score) {
    winner = player2;
  } else {
    winner = 0; // In case of a tie
  }

  try {
    // Update the match with the scores and winner
    const { error } = await supabase
      .from('matches')
      .update({ player1score, player2score, winner })
      .eq('id', matchid);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Check and create next round matches if all matches are completed
    await createNextRound(eventid);

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/update-matchtime', async (req, res) => {
  const { id, matchtime, eventid } = req.body;

  try {
    // Update the matchtime in the matches table
    const { error } = await supabase
      .from('matches')
      .update({ matchtime })
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error('Error updating matchtime:', error.message);
    res.status(500).json({ error: error.message });
  }
});

                                   

                                                                        // VIEWS BELOW


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

  const userId = req.session.user.id; // Assuming user ID is stored in the session

  try {
    // Fetch all topics
    const { data: topics, error: topicsError } = await supabase
      .from('forum_topics')
      .select('*');

    if (topicsError) {
      return res.status(400).json({ error: topicsError.message });
    }

    // Mark topics as followed or not followed by the current user
    const markedTopics = topics.map(topic => {
      const followers = topic.followers || []; // Ensure followers is an array
      topic.followed = followers.includes(userId);
      return topic;
    });

    // Fetch threads that belong to the followed topics
    const followedTopicIds = markedTopics.filter(topic => topic.followed).map(topic => topic.id);
    const { data: threads, error: threadsError } = await supabase
      .from('forum_threads')
      .select('*')
      .in('topicid', followedTopicIds);

    if (threadsError) {
      return res.status(400).json({ error: threadsError.message });
    }

    console.log("Fetched threads:", threads); // Log the threads data to the console 
    console.log("Fetched topics:", markedTopics); // Log the topics data to the console

    // Render the forum.hbs template with the fetched data
    res.render('forum', { forum_threads: threads, forum_topics: markedTopics, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/forum-create', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    const { data: threads, error: threadsError } = await supabase
      .from('forum_threads')
      .select('*');

    if (threadsError) {
      return res.status(400).json({ error: threadsError.message });
    }

    const { data: topics, error: topicsError } = await supabase
      .from('forum_topics')
      .select('*');

    if (topicsError) {
      return res.status(400).json({ error: topicsError.message });
    }

    console.log("Fetched threads data:", threads); // Log the threads data to the console 
    console.log("Fetched topics data:", topics); // Log the topics data to the console 

    // Render the forum-create.hbs template with the fetched data
    res.render('forum-create', { forum_threads: threads, forum_topics: topics, user: req.session.user });
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

    console.log("Fetched thread data:", thread);

    // Fetch the comments for this thread
    const { data: comments, error: commentsError } = await supabase
      .from('forum_comments')
      .select('*')
      .eq('threadid', threadId);

    if (commentsError) {
      return res.status(400).json({ error: commentsError.message });
    }

    console.log("Fetched comments data:", comments);

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

app.get('/clubs-details/:id', async function (req, res) {
  const { id } = req.params;

  if (!req.session.user) {
    return res.redirect('/');
  }
  
  try {
    const { data: club, error: clubsError } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', id)
      .single();

    if (clubsError) {
      return res.status(400).json({ clubsError: clubsError.message });
    }

    const { data: allUsers, error: allUsersError } = await supabase
      .from('users')
      .select('*');

    if (allUsersError) {
      return res.status(400).json({ allUsersError: allUsersError.message });
    }

    const { data: athletes, error: athleteserror } = await supabase
      .from('athletes')
      .select('*');

    if (athleteserror) {
      return res.status(400).json({ athleteserror: athleteserror.message });
    }

    const { data: announcements, error: announcementserror } = await supabase
      .from('club_announcements')
      .select('*')
      .eq('clubid', id);

    if (announcementserror) {
      return res.status(400).json({ announcementserror: announcementserror.message });
    }

    const clubMembers = athletes.filter(athlete => athlete.club === club.clubname);

    // Render the clubs-details.hbs template with the fetched data
    res.render('clubs-details', { club, allUsers, clubMembers, announcements, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/clubs-manage', async function (req, res) {
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
    res.render('clubs-manage', { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message, user: req.session.user });
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

app.get('/events-create/:type', async function (req, res) {
  const { type } = req.params; // Correctly capture the type parameter

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

    // Render the events-create.hbs template with the fetched data
    res.render('events-create', { events: data, user: req.session.user, eventtype: type });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/events-registration/:id', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const { id } = req.params; // Get the event ID from the URL
  const userId = req.session.user.id; // Get the user ID from the session

  try {
    // Fetch the event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError) {
      return res.status(400).json({ error: eventError.message });
    }

    // Fetch the athlete details for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .eq('userid', userId)
      .single();

    if (athleteError) {
      return res.status(400).json({ error: athleteError.message });
    }

    res.render('events-registration', {
      event,
      athlete,
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/events-review-registration/:id', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const { id } = req.params; // Get the event registration ID from the URL
  const userId = req.session.user.id; // Get the user ID from the session

  try {
    // Fetch the event registration details
    const { data: eventregistration, error: eventregError } = await supabase
      .from('events_registrations')
      .select('*')
      .eq('id', id)
      .single();

    if (eventregError) {
      return res.status(400).json({ error: eventregError.message });
    }

    // Fetch the event details using the eventid from the event registration
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventregistration.eventid)
      .single();

    if (eventError) {
      return res.status(400).json({ error: eventError.message });
    }

    // Fetch the athlete details for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .eq('userid', userId)
      .single();

    if (athleteError) {
      return res.status(400).json({ error: athleteError.message });
    }

    res.render('events-review-registration', {
      eventregistration,
      event,
      athlete,
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/events-details/:id', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const { id } = req.params; // Get the event ID from the URL
  const userId = req.session.user.id; // Get the user ID from the session

  try {
    // Fetch the event details from the events table
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError) {
      return res.status(400).json({ error: eventError.message });
    }

    // Fetch the event registrations for the specific event
    const { data: eventregistrations, error: eventregistrationsError } = await supabase
      .from('events_registrations')
      .select('*')
      .eq('eventid', id);

    if (eventregistrationsError) {
      return res.status(400).json({ error: eventregistrationsError.message });
    }

    // Fetch the participants for the specific event
    const { data: participants, error: participantsError } = await supabase
      .from('events_registrations')
      .select('*')
      .eq('registered', 'true')
      .eq('eventid', id);

    if (participantsError) {
      return res.status(400).json({ error: participantsError.message });
    }

    // Check if the current user is already registered for the event
    const { data: currentregistrant, error: currentregistrantError } = await supabase
      .from('events_registrations')
      .select('*')
      .eq('userid', userId)
      .eq('eventid', id)
      .single(); // Use .single() since we're checking for a specific user's registration

    if (currentregistrantError && currentregistrantError.code !== 'PGRST116') { // PGRST116 indicates no rows found, which is okay in this context
      return res.status(400).json({ error: currentregistrantError.message });
    }

    // Fetch the matches for the specific event and order them by id
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('*')
      .eq('eventid', id)
      .order('id', { ascending: true });

    if (matchesError) {
      return res.status(400).json({ error: matchesError.message });
    }

    // Fetch player names and winner names for each match
    for (let match of matches) {
      const { data: player1, error: player1Error } = await supabase
        .from('athletes')
        .select('name')
        .eq('userid', match.player1)
        .single();

      if (player1Error) {
        return res.status(400).json({ error: 'Error fetching player1 name.' });
      }

      const { data: player2, error: player2Error } = await supabase
        .from('athletes')
        .select('name')
        .eq('userid', match.player2)
        .single();

      if (player2Error) {
        return res.status(400).json({ error: 'Error fetching player2 name.' });
      }

      match.player1_name = player1.name;
      match.player2_name = player2.name;

      if (match.winner) {
        const { data: winner, error: winnerError } = await supabase
          .from('athletes')
          .select('name')
          .eq('userid', match.winner)
          .single();

        if (winnerError) {
          return res.status(400).json({ error: 'Error fetching winner name.' });
        }

        match.winner_name = winner.name;
      } else {
        match.winner_name = 'TBD'; // Or set to an appropriate default value
      }
    }

    // Calculate the number of registrations
    const registrationcount = eventregistrations.length;

    console.log("Fetched event data:", event); // Log the event data to the console
    console.log("Fetched event registrations data:", eventregistrations); // Log the event registrations data to the console
    console.log("Fetched participants data:", participants); // Log the participants data to the console
    console.log("Fetched current registrant data:", currentregistrant); // Log the current registrant data to the console
    console.log("Fetched matches data:", matches); // Log the matches data to the console

    // Render the events-details.hbs template with the fetched data
    res.render('events-details', {
      event,
      eventregistrations,
      participants,
      currentregistrant,
      matches,
      registrationcount,
      registrationcap: event.registration_cap, // Assuming the registration cap is stored in the event table
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/profile', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const userId = req.session.user.id;

  try {
    // Check if the user is athlete verified
    const athleteVerified = req.session.user.athleteverified;

    let athlete = null;
    if (athleteVerified) {
      // Fetch the athlete's data
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('userid', userId)
        .single();

      if (error) {
        console.error('Error fetching athlete data:', error.message);
        return res.status(500).json({ error: error.message });
      }

      athlete = data;
    }

    // Render the profile template with the user session data and athlete data (if applicable)
    res.render('profile', { user: req.session.user, athlete });
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/athletes', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const userId = req.session.user.id;

  try {
    // Fetch athletes data
    const { data: athletes, error: athletesError } = await supabase
      .from('athletes')
      .select('*');

    if (athletesError) {
      return res.status(400).json({ error: athletesError.message });
    }

    // Fetch clubs data
    const { data: clubs, error: clubsError } = await supabase
      .from('clubs')
      .select('*')
      .eq('registeredby', userId);

    if (clubsError) {
      return res.status(400).json({ error: clubsError.message });
    }

    console.log("Fetched athletes data:", athletes); // Log the athletes data to the console
    console.log("Fetched clubs data:", clubs); // Log the clubs data to the console

    // Render the athletes.hbs template with the fetched data
    res.render('athletes', { athletes, clubs, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/athletes-profile/:athleteid', async function (req, res) {
  const { athleteid } = req.params;

  if (!req.session.user) {
    return res.redirect('/');
  }

  try {
    // Fetch athlete data
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .eq('id', athleteid)
      .single();

    if (athleteError) {
      return res.status(400).json({ error: athleteError.message });
    }

    // Fetch match data
    const { data: matchdata, error: matchError } = await supabase
      .from('kyurogi_history')
      .select('*')
      .eq('athleteid', athleteid);

    if (matchError) {
      return res.status(400).json({ error: matchError.message });
    }

    // Fetch the most recent match data
    const { data: recentmatch, error: recentmatchError } = await supabase
      .from('kyurogi_history')
      .select('*')
      .eq('athleteid', athleteid)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentmatchError) {
      return res.status(400).json({ error: recentmatchError.message });
    }

    console.log("Fetched athlete data:", athlete); // Log athlete data to the console 
    console.log("Fetched match data:", matchdata); // Log match data to the console 
    console.log("Fetched recent match data:", recentmatch); // Log recent match data to the console 

    // Render the athletes-profile.hbs template with the fetched data
    res.render('athletes-profile', { athlete, matchdata, recentmatch, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/notifications', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }
  
  const userid = req.session.user.id; // Get the current user's username from the session

  try {
    const { data, error } = await supabase
      .from('club_invitations')
      .select('*')
      .eq('invited_user', userid)
      .is('status', null);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console 

    // Render the notifications.hbs template with the fetched data
    res.render('notifications', { club_invitations: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/help-center', async function (req, res) {
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
    res.render('help-center', { athletes: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/kyorugi-scoresheet/:matchid', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const { matchid } = req.params;

  try {
    // Fetch match details
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchid)
      .single();

    if (matchError) {
      return res.status(400).json({ error: matchError.message });
    }

    // Fetch player1 details
    const { data: player1, error: player1Error } = await supabase
      .from('athletes')
      .select('name')
      .eq('userid', match.player1)
      .single();

    if (player1Error) {
      return res.status(400).json({ error: player1Error.message });
    }

    // Fetch player2 details
    const { data: player2, error: player2Error } = await supabase
      .from('athletes')
      .select('name')
      .eq('userid', match.player2)
      .single();

    if (player2Error) {
      return res.status(400).json({ error: player2Error.message });
    }

    console.log("Fetched match data:", match); // Log match data to the console
    console.log("Fetched player1 data:", player1); // Log player1 data to the console
    console.log("Fetched player2 data:", player2); // Log player2 data to the console

    // Render the scoresheet template with the fetched data
    res.render('kyorugi-scoresheet', {
      match,
      player1_name: player1.name,
      player2_name: player2.name,
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




                                                                        //MEMBERSHIP PAGES


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

app.get('/membership-instructor', async function (req, res) {
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
    res.render('membership-instructor', { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/membership-status', async function (req, res) {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const userid = req.session.user.id; // Or use a unique identifier like user ID
  const ptaverified = req.session.user.ptaverified;

  try {
    let nccData, clubData;
    let nccError, clubError;

    if (ptaverified) {
      // Fetch all rows if user is 'pta'
      ({ data: nccData, error: nccError } = await supabase
        .from('ncc_registrations')
        .select('*'));

      ({ data: clubData, error: clubError } = await supabase
        .from('club_registrations')
        .select('*'));

      ({ data: instData, error: clubError } = await supabase
        .from('instructor_registrations')
        .select('*'));
    } else {
      // Fetch only rows submitted by the current user
      ({ data: nccData, error: nccError } = await supabase
        .from('ncc_registrations')
        .select('*')
        .eq('submittedby', userid));

      ({ data: clubData, error: clubError } = await supabase
        .from('club_registrations')
        .select('*')
        .eq('submittedby', userid));

      ({ data: instData, error: clubError } = await supabase
        .from('instructor_registrations')
        .select('*')
        .eq('submittedby', userid));
    }

    if (nccError) {
      console.error('Error fetching NCC data:', nccError.message);
      return res.status(500).send('Error fetching NCC data');
    }

    if (clubError) {
      console.error('Error fetching club data:', clubError.message);
      return res.status(500).send('Error fetching club data');
    }

    res.render('membership-status', { 
      ncc_registrations: nccData, 
      club_registrations: clubData,
      instructor_registrations: instData,
      user: req.session.user 
    });
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

app.get('/instructor-review/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase
      .from('instructor_registrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching registration:', error.message);
      return res.status(500).send('Error fetching registration');
    }

    // Render the membership-review.hbs template with the fetched data
    res.render('instructor-review', { registration: data , user: req.session.user });
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).send('Server error');
  }
});

app.get('/clubreg-review/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase
      .from('club_registrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching registration:', error.message);
      return res.status(500).send('Error fetching registration');
    }

    res.render('clubreg-review', { clubregistration: data , user: req.session.user });
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).send('Server error');
  }
});

app.get('/membership-club', async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase

    if (error) {
      console.error('Error fetching registration:', error.message);
      return res.status(500).send('Error fetching registration');
    }

    // Render the membership-review.hbs template with the fetched data
    res.render('membership-club', { registration: data , user: req.session.user });
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

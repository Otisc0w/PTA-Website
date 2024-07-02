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

                                                                          // fdsfsdfasdfasdfasdfasdf

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
hbs.registerHelper('ne', function (a, b) {
  return a !== b;
});
hbs.registerHelper('notAthleteAndRegistered', function (usertype, registered, options) {
  if (usertype !== 'athlete' && registered === true) {
    return options.fn(this);
  }
  return options.inverse(this);
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
      .from('users') // Replace 'users' with your actual table name if different
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
        clubname,
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

app.post('/submit-instructor', upload.fields([{ name: 'birthcert', maxCount: 1 }, { name: 'portrait', maxCount: 1 }]), async (req, res) => {
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
        clubname,
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

app.post('/create-post', async (req, res) => {
  const {
    title,
    topic,
    body,
    profilepic
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }
  
  const originalposter = req.session.user.username; // Get the current user's id from the session
  const upvotes = [], downvotes =[];

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
        downvotes,
        profilepic
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
      .from('users') // Replace 'users' with your actual table name if different
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

    // Check if status is 4, indicating the need to update the user's registered column and insert into athletes table
    if (status == 4) {
      const { submittedby, firstname, middlename, lastname, gender, bday, 
        phonenum, email, lastpromo, promolocation, clubregion, clubname, 
        beltlevel, instructorfirstname, instructormi, instructorlastname, 
        instructormobile, instructoremail, portrait } = registration;

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
          instructoremail,
          portrait
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

    // Check if status is 4, indicating the need to update the user's registered column and insert into athletes table
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

  const submittedby = req.session.user.username; // Get the current user's username from the session

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

  try {
    const { data, error } = await supabase
      .from('club_invitations')
      .insert([{ club_id, clubname, invited_user, inviter_user }]);

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

app.post('/accept-invitation/:id', async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  const username = req.session.user.username;

  try {
    // Fetch the invitation details to get the clubname
    const { data: invitation, error: fetchError } = await supabase
      .from('club_invitations')
      .select('*')
      .eq('id', id)
      .eq('invited_user', username)
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
      .eq('invited_user', username);

    if (updateInvitationError) {
      console.error('Error accepting invitation:', updateInvitationError.message);
      return res.status(500).send('Error accepting invitation');
    }

    // Update the club column in the users table
    const { error: updateUserError } = await supabase
      .from('users')
      .update({ club: clubname })
      .eq('username', username);

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

  const username = req.session.user.username;

  try {
    const { data, error } = await supabase
      .from('club_invitations')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('invited_user', username);

    if (error) {
      console.error('Error rejecting invitation:', error.message);
      return res.status(500).send('Error rejecting invitation');
    }

    res.redirect('/profile');
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
  
  const username = req.session.user.username; // Get the current user's username from the session

  try {
    const { data, error } = await supabase
      .from('club_invitations')
      .select('*')
      .eq('invited_user', username)
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

    const clubMembers = allUsers.filter(user => user.club === club.clubname);

    // Render the clubs-details.hbs template with the fetched data
    res.render('clubs-details', { club, allUsers, clubMembers, user: req.session.user });
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

  const username = req.session.user.username; // Or use a unique identifier like user ID
  const usertype = req.session.user.usertype;

  try {
    let nccData, clubData;
    let nccError, clubError;

    if (usertype === 'pta') {
      // Fetch all rows if user is 'pta'
      ({ data: nccData, error: nccError } = await supabase
        .from('ncc_registrations')
        .select('*'));

      ({ data: clubData, error: clubError } = await supabase
        .from('club_registrations')
        .select('*'));
    } else {
      // Fetch only rows submitted by the current user
      ({ data: nccData, error: nccError } = await supabase
        .from('ncc_registrations')
        .select('*')
        .eq('submittedby', username));

      ({ data: clubData, error: clubError } = await supabase
        .from('club_registrations')
        .select('*')
        .eq('submittedby', username));
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
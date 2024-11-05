const express = require("express");
const path = require("path");
const multer = require("multer");
const hbs = require("hbs");
const session = require("express-session"); // Import express-session
const app = express();
const moment = require('moment');

require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const asyncfuncs = require("./asyncfuncs");

const port = process.env.PORT || 8080;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
exports.supabase = supabase;

hbs.registerHelper('json', function (context) {
  return JSON.stringify(context, null, 2);
});

// Middleware to parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded data
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
}));

app.use(asyncfuncs.fetchNotifications);
app.use(asyncfuncs.fetchUserData);
app.use(asyncfuncs.checkAndExpireNCCRegistrations);
app.use(asyncfuncs.checkAndExpireInstructorRegistrations);
app.use(asyncfuncs.checkUpcomingEvents);



// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

hbs.registerHelper("reverseEach", function (context, options) {
  let out = "";
  for (let i = context.length - 1; i >= 0; i--) {
    out += options.fn(context[i]);
  }
  return out;
});
hbs.registerHelper("eq", function (a, b) {
  return a === b;
});
hbs.registerHelper("me", function (a, b) {
  return a >= b;
});
hbs.registerHelper("le", function (a, b) {
  return a <= b;
});
hbs.registerHelper("ne", function (a, b) {
  return a !== b;
});
hbs.handlebars.registerHelper("or", function (a, b) {
  return a || b;
});
hbs.handlebars.registerHelper("and", function (a, b) {
  return a && b;
});
hbs.registerHelper("arraySize", function (array) {
  return array.length;
});
hbs.registerHelper('ordinal', function (number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = number % 100;
  return number + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
});
hbs.registerHelper("renderComments", function (comments, options) {
  function renderNestedComments(comments, parentId) {
    let out = "<ul>";
    comments
      .filter((comment) => comment.parentid === parentId)
      .forEach((comment) => {
        out += "<li>" + options.fn(comment);
        const childComments = comments.filter((c) => c.parentid === comment.id);
        if (childComments.length) {
          out += renderNestedComments(comments, comment.id);
        }
        out += "</li>";
      });
    out += "</ul>";
    return out;
  }

  return renderNestedComments(comments, null);
});
hbs.registerHelper("formatStatus", function (status) {
  switch (status) {
    case 1:
      return '<span class="status-under-review">Under Review</span>';
    case 2:
      return '<span class="status-en-route">En-route to Regional Office</span>';
    case 3:
      return '<span class="status-shipped">ID Shipped</span>';
    case 4:
      return '<span class="status-rejected">Reject Application</span>';
    case 5:
      return '<span class="status-expired">Expired</span>';
    default:
      return '<span class="status-unknown">Unknown Status</span>';
      
  }
});
hbs.registerHelper('formatDate', function (date, format) {
  return moment(date).format(format);
});
hbs.registerHelper('formatCreatedAt', function (created_at) {
  return moment(created_at).format('MMM D h:mm A');
});
hbs.registerHelper('formatTime', function (time, format) {
  return moment(time, 'HH:mm:ss').format(format);
});


app.use( session({
    secret: "your_secret_key", // Replace with a secure secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);



// Set up Handlebars view engine
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

// Route to fetch and display data on the index page
app.get("/", async (req, res) => {
  try {
    // Fetch users data
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("*");

    if (usersError) {
      return res.status(400).json({ error: usersError.message });
    }

    // Fetch athletes data
    const { data: athletes, error: athletesError } = await supabase
      .from("athletes")
      .select("*");

    if (athletesError) {
      return res.status(400).json({ error: athletesError.message });
    }

    console.log("Fetched users data:", users); // Log the users data to the console
    console.log("Fetched athletes data:", athletes); // Log the athletes data to the console

    // Render the index.hbs template with the fetched data
    res.render("index", { users, athletes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Example route to get a specific row from Supabase and log it
app.get("/data/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
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
app.post("/submit-login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .single(); // Ensure a single match

    if (error || !data) {
      // Invalid credentials
      return res.status(401).render("index", {
        error: "Invalid username or password.",
        users: [], // Pass users array if needed
        athletes: [], // Pass athletes array if needed
      });
    }

    // Store user in session
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
      ptaverified: data.ptaverified,
    };
    // Successful login
    res.redirect("/home");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/submit-signup", async (req, res) => {
  const {
    username,
    firstname,
    middlename = "",
    lastname,
    email,
    password,
  } = req.body; // Capture user input from the form

  const athleteverified = false;
  const instructorverified = false;
  const ptaverified = false;

  try {
    const { data: existingUsers, error: existingUsersError } = await supabase
      .from("users")
      .select("username, email")
      .or(`username.eq.${username},email.eq.${email}`);

    if (existingUsersError) {
      // Handle any errors that occur during the select
      return res.status(500).render("index", {
        error: "Error checking existing users.",
        users: [], // Optionally pass users array if you need it in the view
      });
    }

    if (existingUsers.length > 0) {
      return res.redirect("/?signup=failed");
    }

    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          username,
          email,
          firstname,
          middlename,
          lastname,
          password,
          athleteverified,
          instructorverified,
          ptaverified,
        },
      ]);

    if (error) {
      return res.status(500).render("index", {
        error: "Error creating user.",
        users: [], // Optionally pass users array if you need it in the view
      });
    }

    res.redirect("/");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/submit-ncc", upload.fields([
    { name: "birthcert", maxCount: 1 },
    { name: "portrait", maxCount: 1 },
  ]),
  async (req, res) => {
    const {
      apptype,
      firstname,
      middlename,
      lastname,
      gender,
      bday,
      age,
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
    } = req.body; // Capture user input from the form

    if (!req.session.user) {
      return res.status(401).send("Unauthorized: No user logged in");
    }

    const submittedby = req.session.user.id; // Get the current user's username from the session
    const status = 1;

    let birthcertUrl = null;
    let portraitUrl = null;

    if (req.files) {
      try {
        if (req.files.birthcert) {
          const birthcertPath = `documents/${Date.now()}-${
            req.files.birthcert[0].originalname
          }`;
          const { error: birthcertUploadError } = await supabase.storage
            .from("documents")
            .upload(birthcertPath, req.files.birthcert[0].buffer, {
              contentType: req.files.birthcert[0].mimetype,
            });

          if (birthcertUploadError) {
            console.error(
              "Error uploading birth certificate:",
              birthcertUploadError.message
            );
            return res.status(500).send("Error uploading birth certificate");
          }

          birthcertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${birthcertPath}`;
        }

        if (req.files.portrait) {
          const portraitPath = `documents/${Date.now()}-${
            req.files.portrait[0].originalname
          }`;
          const { error: portraitUploadError } = await supabase.storage
            .from("documents")
            .upload(portraitPath, req.files.portrait[0].buffer, {
              contentType: req.files.portrait[0].mimetype,
            });

          if (portraitUploadError) {
            console.error(
              "Error uploading portrait:",
              portraitUploadError.message
            );
            return res.status(500).send("Error uploading portrait");
          }

          portraitUrl = `${supabaseUrl}/storage/v1/object/public/documents/${portraitPath}`;
        }
      } catch (error) {
        console.error("Server error during file upload:", error.message);
        return res.status(500).json({ error: error.message });
      }
    }

    try {
      // Check if a row with the same submittedby already exists
      const { data: existingRegistration, error: existingRegistrationError } = await supabase
        .from("ncc_registrations")
        .select("*")
        .eq("submittedby", submittedby)
        .single();

      if (existingRegistrationError && existingRegistrationError.code !== 'PGRST116') {
        console.error("Error checking existing registration:", existingRegistrationError.message);
        return res.status(500).render("membership", {
          error: "Error checking existing registration.",
          users: [], // Optionally pass users array if you need it in the view
        });
      }

      if (existingRegistration) {
        // Update the existing registration
        const { data, error } = await supabase
          .from("ncc_registrations")
          .update({
            apptype,
            firstname,
            middlename,
            lastname,
            gender,
            bday,
            age,
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
            birthcert: birthcertUrl, // Include the birth certificate URL
            portrait: portraitUrl, // Include the portrait URL
          })
          .eq("submittedby", submittedby);

        if (error) {
          console.error("Error updating registration:", error.message);
          return res.status(500).render("membership", {
            error: "Error updating registration.",
            users: [], // Optionally pass users array if you need it in the view
          });
        }
      } else {
        // Insert a new registration
        const { data, error } = await supabase.from("ncc_registrations").insert([
          {
            apptype,
            firstname,
            middlename,
            lastname,
            gender,
            bday,
            age,
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
            portrait: portraitUrl, // Include the portrait URL
          },
        ]);

        if (error) {
          console.error("Error creating registration:", error.message);
          return res.status(500).render("membership", {
            error: "Error creating registration.",
            users: [], // Optionally pass users array if you need it in the view
          });
        }
      }

      // Add a notification for the user about their NCC registration submission
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert([
          {
            userid: submittedby,
            type: "Registration",
            message: "Your NCC registration has been successfully submitted.",
            desc: "Your NCC registration has been successfully submitted and is now awaiting review. You will receive notifications for the status of your application.",
          },
        ]);

      if (notificationError) {
        console.error("Error creating notification:", notificationError.message);
        return res.status(500).send("Error creating notification");
      }

      res.redirect("/membership");
    } catch (error) {
      console.error("Server error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

app.post("/submit-instructor", upload.fields([
    { name: "birthcert", maxCount: 1 },
    { name: "portrait", maxCount: 1 },
    { name: "educproof", maxCount: 1 },
    { name: "poomsaecert", maxCount: 1 },
    { name: "kukkiwoncert", maxCount: 1 },
    { name: "ptablackbeltcert", maxCount: 1 },
  ]),
  async (req, res) => {
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
      return res.status(401).send("Unauthorized: No user logged in");
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
          const birthcertPath = `documents/${Date.now()}-${
            req.files.birthcert[0].originalname
          }`;
          const { error: birthcertUploadError } = await supabase.storage
            .from("documents")
            .upload(birthcertPath, req.files.birthcert[0].buffer, {
              contentType: req.files.birthcert[0].mimetype,
            });

          if (birthcertUploadError) {
            console.error(
              "Error uploading birth certificate:",
              birthcertUploadError.message
            );
            return res.status(500).send("Error uploading birth certificate");
          }

          birthcertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${birthcertPath}`;
        }

        if (req.files.portrait) {
          const portraitPath = `documents/${Date.now()}-${
            req.files.portrait[0].originalname
          }`;
          const { error: portraitUploadError } = await supabase.storage
            .from("documents")
            .upload(portraitPath, req.files.portrait[0].buffer, {
              contentType: req.files.portrait[0].mimetype,
            });

          if (portraitUploadError) {
            console.error(
              "Error uploading portrait:",
              portraitUploadError.message
            );
            return res.status(500).send("Error uploading portrait");
          }

          portraitUrl = `${supabaseUrl}/storage/v1/object/public/documents/${portraitPath}`;
        }

        if (req.files.educproof) {
          const educproofPath = `documents/${Date.now()}-${
            req.files.educproof[0].originalname
          }`;
          const { error: educproofUploadError } = await supabase.storage
            .from("documents")
            .upload(educproofPath, req.files.educproof[0].buffer, {
              contentType: req.files.educproof[0].mimetype,
            });

          if (educproofUploadError) {
            console.error(
              "Error uploading educproof:",
              educproofUploadError.message
            );
            return res.status(500).send("Error uploading educproof");
          }

          educproofUrl = `${supabaseUrl}/storage/v1/object/public/documents/${educproofPath}`;
        }

        if (req.files.poomsaecert) {
          const poomsaecertPath = `documents/${Date.now()}-${
            req.files.poomsaecert[0].originalname
          }`;
          const { error: poomsaecertUploadError } = await supabase.storage
            .from("documents")
            .upload(poomsaecertPath, req.files.poomsaecert[0].buffer, {
              contentType: req.files.poomsaecert[0].mimetype,
            });

          if (poomsaecertUploadError) {
            console.error(
              "Error uploading poomsaecert:",
              poomsaecertUploadError.message
            );
            return res.status(500).send("Error uploading poomsaecert");
          }

          poomsaecertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${poomsaecertPath}`;
        }

        if (req.files.kukkiwoncert) {
          const kukkiwoncertPath = `documents/${Date.now()}-${
            req.files.kukkiwoncert[0].originalname
          }`;
          const { error: kukkiwoncertUploadError } = await supabase.storage
            .from("documents")
            .upload(kukkiwoncertPath, req.files.kukkiwoncert[0].buffer, {
              contentType: req.files.kukkiwoncert[0].mimetype,
            });

          if (kukkiwoncertUploadError) {
            console.error(
              "Error uploading kukkiwoncert:",
              kukkiwoncertUploadError.message
            );
            return res.status(500).send("Error uploading kukkiwoncert");
          }

          kukkiwoncertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${kukkiwoncertPath}`;
        }

        if (req.files.ptablackbeltcert) {
          const ptablackbeltcertPath = `documents/${Date.now()}-${
            req.files.ptablackbeltcert[0].originalname
          }`;
          const { error: ptablackbeltcertUploadError } = await supabase.storage
            .from("documents")
            .upload(
              ptablackbeltcertPath,
              req.files.ptablackbeltcert[0].buffer,
              {
                contentType: req.files.ptablackbeltcert[0].mimetype,
              }
            );

          if (ptablackbeltcertUploadError) {
            console.error(
              "Error uploading ptablackbeltcert:",
              ptablackbeltcertUploadError.message
            );
            return res.status(500).send("Error uploading ptablackbeltcert");
          }

          ptablackbeltcertUrl = `${supabaseUrl}/storage/v1/object/public/documents/${ptablackbeltcertPath}`;
        }
      } catch (error) {
        console.error("Server error during file upload:", error.message);
        return res.status(500).json({ error: error.message });
      }
    }

    try {
      // Check if a row with the same submittedby already exists
      const { data: existingRegistration, error: existingRegistrationError } = await supabase
        .from("instructor_registrations")
        .select("*")
        .eq("submittedby", submittedby)
        .single();

      if (existingRegistrationError && existingRegistrationError.code !== 'PGRST116') {
        console.error("Error checking existing registration:", existingRegistrationError.message);
        return res.status(500).render("membership", {
          error: "Error checking existing registration.",
          users: [], // Optionally pass users array if you need it in the view
        });
      }

      if (existingRegistration) {
        // Update the existing registration
        const { data, error } = await supabase
          .from("instructor_registrations")
          .update({
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
            birthcert: birthcertUrl, // Include the birth certificate URL
            portrait: portraitUrl, // Include the portrait URL
            educproof: educproofUrl,
            poomsaecert: poomsaecertUrl,
            kukkiwoncert: kukkiwoncertUrl,
            ptablackbeltcert: ptablackbeltcertUrl,
          })
          .eq("submittedby", submittedby);

        if (error) {
          console.error("Error updating registration:", error.message);
          return res.status(500).render("membership", {
            error: "Error updating registration.",
            users: [], // Optionally pass users array if you need it in the view
          });
        }
      } else {
        // Insert a new registration
        const { data, error } = await supabase
          .from("instructor_registrations")
          .insert([
            {
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
              ptablackbeltcert: ptablackbeltcertUrl,
            },
          ]);

        if (error) {
          console.error("Error creating registration:", error.message);
          return res.status(500).render("membership", {
            error: "Error creating registration.",
            users: [], // Optionally pass users array if you need it in the view
          });
        }
      }

      res.redirect("/membership");
    } catch (error) {
      console.error("Server error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

app.post("/create-post", async (req, res) => {
  const { title, topicid, body, profilepic } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const originalposter = req.session.user.username; // Get the current user's id from the session
  const upvotes = [],
    downvotes = [];

  try {
    // Fetch the topic from the forum_topics table using the topicid
    const { data: topicData, error: topicError } = await supabase
      .from("forum_topics")
      .select("topic")
      .eq("id", topicid)
      .single();

    if (topicError) {
      // Handle any errors that occur during the topic fetch
      console.error("Error fetching topic:", topicError.message);
      return res.status(500).send("Error fetching topic");
    }

    const topic = topicData.topic; // Extract the topic value

    // Insert the new forum thread into the forum_threads table
    const { data, error } = await supabase.from("forum_threads").insert([
      {
        title,
        originalposter,
        topic,
        topicid,
        body,
        upvotes,
        downvotes,
        profilepic,
      },
    ]);

    if (error) {
      // Handle any errors that occur during the insert
      console.error("Error creating post:", error.message);
      return res.status(500).render("forum", {
        error: "Error creating post.",
        users: [], // Optionally pass users array if you need it in the view
      });
    }

    res.redirect("/forum");
  } catch (error) {
    // Handle any server-side errors
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/create-topic", async (req, res) => {
  const { topic } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  try {
    // Update the user in the database
    const { data, error } = await supabase.from("forum_topics").insert([
      {
        topic,
      },
    ]);

    if (error) {
      // Handle any errors that occur during the update
      return res.status(500).render("forum", {
        error: "Error updating profile.",
        users: [], // Optionally pass users array if you need it in the view
      });
    }

    res.redirect("/forum");
  } catch (error) {
    // Handle any server-side errors
    res.status(500).json({ error: error.message });
  }
});

app.post('/forum/update-post', async (req, res) => {
  try {
    // Log the form data for debugging purposes
    console.log("Form data:", req.body);

    // Extract fields from request body
    const { title, topic, body, threadId } = req.body;  // Ensure threadId is passed in the form

    // Perform the update in the database
    const { data, error } = await supabase
      .from('forum_threads')  // Replace with your actual table name
      .update({
        title: title,
        topic: topic,
        body: body,
      })
      .eq('id', threadId);  // Make sure this is the correct field

    if (error) {
      console.error("Error updating post:", error.message);
      return res.status(500).render("forum", {
        error: "Error updating post.",
        thread: {},  // Optionally, pass the thread object to show current data if needed
      });
    }

    // Redirect to the forum after successful update
    res.redirect(`/forum`);
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).render("forum", {
      error: "An unexpected error occurred.",
    });
  }
});

app.post('/forum/delete-post', async (req, res) => {
  const { threadId } = req.body;  // Get the post ID from the form body

  console.log("Deleting post with threadId:", threadId);  // Log the threadId for debugging

  try {
    const { data, error } = await supabase
      .from('forum_threads')  // Replace 'forum_threads' with your actual table name
      .delete()
      .eq('id', threadId);  // Match the post by ID

    if (error) {
      return res.status(500).json({ success: false, error: 'Error deleting post' });
    }

    res.redirect(`/forum`);  // Redirect to the forum after deleting the post
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/forum-thread/update-post', async (req, res) => {
  try {
    // Extract the necessary fields from the request body
    const { title, topic, body } = req.body;
    const threadId = req.body.threadId; // Assuming you pass the threadId to identify which post to update
    
    // Update the post in the database
    const { data, error } = await supabase
      .from('forum_threads') // Replace 'threads' with your actual table name if different
      .update({
        title: title,
        topic:topic,
        body: body,
      })
      .eq('id', threadId); // Ensure the correct id is used in the eq method

    if (error) {
      console.error("Error updating post:", error.message);
      return res.status(500).render("forum-thread", {
        error: "Error updating post.",
        thread: {}, // Optionally pass the thread object to show current data if needed
      });
    }

    // Redirect or render success view
    res.redirect(`/forum-thread/${threadId}`);
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).render("forum-thread", {
      error: "An unexpected error occurred.",
    });
  }
});

app.post('/forum-thread/delete-post', async (req, res) => {
  const {threadId} = req.body; // Get the post ID from the form body

  try {
    // Delete the post from your database (adjust according to your database setup)
    const { data, error } = await supabase
      .from('forum_threads')  // Replace 'forum_threads' with your actual table name
      .delete()
      .eq('id', threadId);  // Match the post by ID

    if (error) {
      return res.status(500).json({ success: false, error: 'Error deleting post' });
    }

    res.redirect(`/forum`); // Redirect to the forum after deleting the post
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post("/delete-notification/:id", async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const userid = req.session.user.id;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("userid", userid);

    if (error) {
      console.error("Error deleting notification:", error.message);
      return res.status(500).send("Error deleting notification");
    }

    res.redirect("/notifications");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/delete-all-notifications", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const userid = req.session.user.id;

  try {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("userid", userid);

    if (error) {
      console.error("Error deleting notifications:", error.message);
      return res.status(500).send("Error deleting notifications");
    }

    res.redirect("/notifications");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/save-profile-changes", upload.single("file"), async (req, res) => {
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
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const id = req.session.user.id; // Get the current user's id from the session
  let profilepic = req.session.user.profilepic;

  if (req.file) {
    try {
      const filePath = `profilepics/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("profilepics")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        console.error("Error uploading profile picture:", uploadError.message);
        return res.status(500).send("Error uploading profile picture");
      }

      profilepic = `${supabaseUrl}/storage/v1/object/public/profilepics/${filePath}`;
    } catch (error) {
      console.error("Server error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    // Update the user in the database
    const { data, error } = await supabase
      .from("users") // Replace 'users' with your actual table name if different
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
        profilepic,
      })
      .eq("id", id); // Ensure the correct id is used in the eq method

    if (error) {
      console.error("Error updating profile:", error.message);
      return res.status(500).render("home", {
        error: "Error updating profile.",
        users: [], // Optionally pass users array if you need it in the view
      });
    }

    // Update the session with the new user data if needed
    req.session.user = {
      ...req.session.user,
      firstname,
      middlename,
      lastname,
      email,
      profilepic,
    };

    console.log("Profile updated successfully for user:", id);

    res.redirect("/profile");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const id = req.session.user.id;

  try {
    // Validate current password (implementation depends on how passwords are stored)
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (userError || !user || user.password !== currentPassword) {
      return res.status(401).send("Incorrect current password");
    }

    // Update the user's password in the database
    const { data, error } = await supabase
      .from("users")
      .update({
        password: newPassword,
      })
      .eq("id", id);

    if (error) {
      console.error("Error changing password:", error.message);
      return res.status(500).send("Error changing password");
    }

    res.status(200).send("Password changed successfully");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-nccstatus", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const { applicationId, status } = req.body; // Capture application ID and new status from the form
  let expireson = new Date();
  expireson.setFullYear(expireson.getFullYear() + 1);

  try {
    // Update the status of the specific registration in the database
    const { data: registration, error: updateStatusError } = await supabase
      .from("ncc_registrations")
      .update({ status })
      .eq("id", applicationId)
      .select("*")
      .single(); // Fetch the updated registration to get the submittedby value

    if (updateStatusError) {
      console.error("Error updating status:", updateStatusError.message);
      return res.status(500).send("Error updating status");
    }

    // Add a notification for the user about their registration status
    let statusMessage;
    const statusInt = parseInt(status, 10);

    switch (statusInt) {
      case 1:
        statusMessage = "Your NCC registration is under review.";
        statusDesc = "Your NCC registration is under review. You will receive a notification once your registration has been processed.";
        break;
            case 2:
        statusMessage = "Your NCC ID is en route to your regional office.";
        statusDesc = "Your NCC ID is on its way to your regional office. You will be notified once it arrives.";
        break;
            case 3:
        statusMessage = "Your NCC ID is now ready for pickup at your regional office.";
        statusDesc = "Your NCC ID is ready for pickup at your regional office. Please visit the office to collect it.";
        break;
            case 4:
        statusMessage = "Your NCC registration has been rejected.";
        statusDesc = "Sorry, your NCC registration has been rejected. Please contact support for more information.";
        break;
            default:
        statusMessage = "Unknown status.";
        statusDesc = "The status of your NCC registration is unknown. Please contact support for more information.";
    }

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert([
      {
        userid: registration.submittedby,
        type: "Registration",
        message: statusMessage,
        desc: statusDesc,
      },
      ]);

    if (notificationError) {
      console.error("Error creating notification:", notificationError.message);
      return res.status(500).send("Error creating notification");
    }

    console.log("Registration updated:", registration);

    // Check if status is 3, indicating the need to update the user's athleteverified column and insert into athletes table
    if (status == 3) {
      const {
      firstname,
      middlename,
      lastname,
      gender,
      bday,
      clubregion,
      club,
      beltlevel,
      portrait,
      division,
      height,
      weight,
      submittedby,
      instructorfirstname,
      instructorlastname,
      age,
      } = registration;

      console.log("Updating user with ID:", submittedby);

      // Update the corresponding user's registered column to true
      const { data: user, error: updateUserError } = await supabase
      .from("users")
      .update({ athleteverified: true })
      .eq("id", submittedby)
      .select("*")
      .single();

      if (updateUserError) {
      console.error("Error updating user:", updateUserError.message);
      return res.status(500).send("Error updating user");
      }

      // Update the expireson column
      const { error: updateExpiresOnError } = await supabase
        .from("ncc_registrations")
        .update({ expireson })
        .eq("id", applicationId);

      if (updateExpiresOnError) {
        console.error("Error updating expireson:", updateExpiresOnError.message);
        return res.status(500).send("Error updating expireson");
      }

      console.log("User updated:", user);
      const name = `${firstname} ${middlename} ${lastname}`;
      const instructor = `${instructorfirstname} ${instructorlastname}`;

      const userid = submittedby;

      // Check if the athlete already exists
      const { data: existingAthlete, error: fetchAthleteError } = await supabase
      .from("athletes")
      .select("*")
      .eq("userid", userid)
      .single();

      if (fetchAthleteError && fetchAthleteError.code !== 'PGRST116') {
      console.error("Error fetching athlete:", fetchAthleteError.message);
      return res.status(500).send("Error fetching athlete");
      }

      if (existingAthlete) {
      // Update the existing athlete
      const { error: updateAthleteError } = await supabase
        .from("athletes")
        .update({
        name,
        gender,
        bday,
        clubregion,
        club,
        beltlevel,
        portrait,
        division,
        height,
        weight,
        instructor,
        age,
        })
        .eq("userid", userid);

      if (updateAthleteError) {
        console.error("Error updating athlete:", updateAthleteError.message);
        return res.status(500).send("Error updating athlete");
      }

      console.log("Athlete updated successfully");
      } else {
      // Insert the new athlete
      const { error: insertAthleteError } = await supabase
        .from("athletes")
        .insert([
        {
          name,
          gender,
          bday,
          clubregion,
          club,
          beltlevel,
          portrait,
          division,
          height,
          weight,
          instructor,
          userid,
          age,
        },
        ]);

      if (insertAthleteError) {
        console.error("Error inserting athlete:", insertAthleteError.message);
        return res.status(500).send("Error inserting athlete");
      }

      console.log("Athlete inserted successfully");
      }

      // Store athlete data in session
      req.session.athlete = {
      firstname,
      middlename,
      lastname,
      gender,
      bday,
      clubregion,
      club,
      beltlevel,
      portrait,
      division,
      height,
      weight,
      };
    }

    res.redirect(`/membership-review/${applicationId}`); // Redirect back to the review page
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-instructorstatus", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  let expireson = new Date();
  expireson.setFullYear(expireson.getFullYear() + 1);
  const { applicationId, status } = req.body; // Capture application ID and new status from the form

  try {
    // Update the status of the specific registration in the database
    const { data: registration, error: updateStatusError } = await supabase
      .from("instructor_registrations")
      .update({ status })
      .eq("id", applicationId)
      .select("*")
      .single(); // Fetch the updated registration to get the submittedby value

    if (updateStatusError) {
      console.error("Error updating status:", updateStatusError.message);
      return res.status(500).send("Error updating status");
    }

    console.log("Registration updated:", registration);

    // Add a notification for the user about their registration status
    let statusMessage;
    const statusInt = parseInt(status, 10);

    switch (statusInt) {
      case 1:
        statusMessage = "Your instructor registration is under review.";
        break;
      case 2:
        statusMessage = "Your instructor registration is being processed.";
        break;
      case 3:
        statusMessage = "Your instructor registration is approved.";
        break;
      case 4:
        statusMessage = "Your instructor registration is verified.";
        break;
      case 5:
        statusMessage = "Your instructor registration has been rejected.";
        break;
      default:
        statusMessage = "Unknown status.";
    }

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert([
        {
          userid: registration.submittedby,
          type: "Registration",
          message: statusMessage,
        },
      ]);

    if (notificationError) {
      console.error("Error creating notification:", notificationError.message);
      return res.status(500).send("Error creating notification");
    }

    // Check if status is 4, indicating the need to update the user's instructorverified column
    if (status == 3) {
      const { submittedby } = registration;

      console.log("Updating user with username:", submittedby);

      // Update the corresponding user's instructorverified column to true
      const { data: user, error: updateUserError } = await supabase
        .from("users")
        .update({ instructorverified: true })
        .eq("id", submittedby)
        .select("*")
        .single();

      if (updateUserError) {
        console.error("Error updating user:", updateUserError.message);
        return res.status(500).send("Error updating user");
      }

      // Update the expireson column
      const { error: updateExpiresOnError } = await supabase
        .from("instructor_registrations")
        .update({ expireson })
        .eq("id", applicationId);

      if (updateExpiresOnError) {
        console.error("Error updating expireson:", updateExpiresOnError.message);
        return res.status(500).send("Error updating expireson");
      }

      console.log("Instructor verified successfully");
    }

    res.redirect(`/instructor-review/${applicationId}`); // Redirect back to the review page
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-clubstatus", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const { applicationId, status } = req.body; // Capture application ID and new status from the form

  try {
    // Update the status of the specific registration in the database
    const { data: clubregistration, error: updateStatusError } = await supabase
      .from("club_registrations")
      .update({ status })
      .eq("id", applicationId)
      .select("*")
      .single(); // Fetch the updated registration to get the submittedby value

    if (updateStatusError) {
      console.error("Error updating status:", updateStatusError.message);
      return res.status(500).send("Error updating status");
    }

    console.log("Registration updated:", clubregistration);

    // Check if status is 4, indicating the need to update the user's athleteverified column and insert into athletes table
    if (status == 4) {
      const {
        phonenum,
        email,
        clubname,
        clubaddress,
        province,
        submittedby,
        clubpic,
        registeree,
      } = clubregistration;

      console.log("Updating user with username:", submittedby);

      const registeredby = submittedby;

      const { error: insertClubError } = await supabase.from("clubs").insert([
        {
          clubname,
          phonenum,
          email,
          clubaddress,
          province,
          registeredby,
          registeree,
          clubpic,
        },
      ]);

      if (insertClubError) {
        console.error("Error inserting athlete:", insertClubError.message);
        return res.status(500).send("Error inserting club");
      }

      console.log("Club inserted successfully");
    }

    res.redirect(`/clubreg-review/${applicationId}`); // Redirect back to the review page
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/add-comment", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const { threadid, comment, parentid } = req.body;
  const commenter = req.session.user.username;

  try {
    // Insert the new comment into the database
    const { error } = await supabase.from("forum_comments").insert([
      {
        threadid,
        parentid: parentid === "null" ? null : parentid, // Handle replies
        commenter,
        comment,
      },
    ]);

    if (error) {
      console.error("Error inserting comment:", error.message);
      return res.status(500).send("Error inserting comment");
    }

    res.redirect(`/forum-thread/${threadid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/submit-club",
  upload.fields([
    { name: "idfile", maxCount: 1 },
    { name: "proofdoc", maxCount: 1 },
    { name: "clubpic", maxCount: 1 },
  ]),
  async (req, res) => {
    const {
      firstname,
      lastname,
      phonenum,
      email,
      clubname,
      clubaddress,
      province,
    } = req.body; // Capture user input from the form

    const status = 1;

    if (!req.session.user) {
      return res.status(401).send("Unauthorized: No user logged in");
    }

    const submittedby = req.session.user.id; // Get the current user's username from the session

    let idfileUrl = "";
    let proofdocUrl = "";
    let clubpicUrl = "";

    console.log("Files received:", req.files);

    if (req.files) {
      try {
        if (req.files.idfile) {
          const idfilePath = `documents/${Date.now()}-${
            req.files.idfile[0].originalname
          }`;
          console.log("Uploading ID file:", idfilePath);
          const { error: idfileError } = await supabase.storage
            .from("documents")
            .upload(idfilePath, req.files.idfile[0].buffer, {
              contentType: req.files.idfile[0].mimetype,
            });

          if (idfileError) {
            console.error("Error uploading ID file:", idfileError.message);
            return res.status(500).send("Error uploading ID file");
          }

          idfileUrl = `${supabaseUrl}/storage/v1/object/public/documents/${idfilePath}`;
          console.log("ID file uploaded to:", idfileUrl);
        }

        if (req.files.proofdoc) {
          const proofdocPath = `documents/${Date.now()}-${
            req.files.proofdoc[0].originalname
          }`;
          console.log("Uploading proof document:", proofdocPath);
          const { error: proofdocError } = await supabase.storage
            .from("documents")
            .upload(proofdocPath, req.files.proofdoc[0].buffer, {
              contentType: req.files.proofdoc[0].mimetype,
            });

          if (proofdocError) {
            console.error(
              "Error uploading proof document:",
              proofdocError.message
            );
            return res.status(500).send("Error uploading proof document");
          }

          proofdocUrl = `${supabaseUrl}/storage/v1/object/public/documents/${proofdocPath}`;
          console.log("Proof document uploaded to:", proofdocUrl);
        }

        if (req.files.clubpic) {
          const clubpicPath = `documents/${Date.now()}-${
            req.files.clubpic[0].originalname
          }`;
          console.log("Uploading club picture:", clubpicPath);
          const { error: clubpicError } = await supabase.storage
            .from("documents")
            .upload(clubpicPath, req.files.clubpic[0].buffer, {
              contentType: req.files.clubpic[0].mimetype,
            });

          if (clubpicError) {
            console.error(
              "Error uploading club picture:",
              clubpicError.message
            );
            return res.status(500).send("Error uploading club picture");
          }

          clubpicUrl = `${supabaseUrl}/storage/v1/object/public/documents/${clubpicPath}`;
          console.log("Club picture uploaded to:", clubpicUrl);
        }
      } catch (error) {
        console.error("Server error during file upload:", error.message);
        return res.status(500).json({ error: error.message });
      }
    }

    console.log("ID File URL:", idfileUrl);
    console.log("Proof Document URL:", proofdocUrl);
    console.log("Club Picture URL:", clubpicUrl);

    try {
      // Insert the new club registration into the database
      const { data, error } = await supabase
        .from("club_registrations") // Replace 'club_registrations' with your actual table name if different
        .insert([
          {
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
            status,
          },
        ])
        .select(); // Ensure the data is returned

      if (error) {
        console.error("Error inserting club registration:", error.message);
        return res.status(500).send("Error inserting club registration");
      }

      console.log("Club registration submitted successfully:", data);

      res.redirect("membership"); // Redirect to a success page or another appropriate route
    } catch (error) {
      console.error("Server error during database insertion:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

app.post("/invite-user", async (req, res) => {
  const { club_id, invited_user, clubname } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const inviter_user = req.session.user.username;
  const invitername = req.session.user.firstname + req.session.user.lastname;

  try {
    const { data, error } = await supabase
      .from("club_invitations")
      .insert([{ club_id, clubname, invited_user, inviter_user, invitername }]);

    if (error) {
      console.error("Error inviting user:", error.message);
      return res.status(500).send("Error inviting user");
    }

    res.redirect(`/clubs-details/${club_id}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/invite-player", async (req, res) => {
  const { userid, clubid } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const inviter_user = req.session.user.id; // Get the current user's ID
  const invitername = req.session.user.firstname + req.session.user.lastname;
  const invited_user = userid;

  try {
    // Fetch the club name where the club ID is provided
    const { data: clubData, error: clubError } = await supabase
      .from("clubs")
      .select("clubname")
      .eq("id", clubid)
      .single();

    if (clubError) {
      return res.status(500).json({ error: clubError.message });
    }

    const clubname = clubData.clubname;
    const club_id = clubid;

    // Insert the invitation into the invitations table
    const { data, error } = await supabase
      .from("club_invitations")
      .insert([{ invited_user, inviter_user, club_id, clubname, invitername }]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.redirect("/athletes"); // Redirect back to the athletes page after inviting
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/request-join-club", async (req, res) => {
  const { clubid, message } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const userid = req.session.user.id;
  const username = req.session.user.username;
  const useremail = req.session.user.email;

  try {
    const { data, error } = await supabase
      .from("club_requests")
      .insert([{
        clubid, 
        userid,
        message,
        status: "pending",
       }]);

    if (error) {
      console.error("Error requesting to join club:", error.message);
      return res.status(500).send("Error requesting to join club");
    }

    res.redirect(`/clubs-details/${clubid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/accept-join-club-request", async (req, res) => {
  const { id, userid } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  try {
    // Fetch the join request details to get the clubname
    // Fetch the join request details to get the clubid
    const { data: joinRequest, error: fetchError } = await supabase
      .from("club_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !joinRequest) {
      console.error(
      "Error fetching join request:",
      fetchError ? fetchError.message : "Join request not found"
      );
      return res.status(500).send("Error fetching join request");
    }

    const clubid = joinRequest.clubid;

    // Fetch the club name from the clubs table using the clubid
    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("clubname")
      .eq("id", clubid)
      .single();

    if (clubError || !club) {
      console.error(
      "Error fetching club name:",
      clubError ? clubError.message : "Club not found"
      );
      return res.status(500).send("Error fetching club name");
    }

    const clubname = club.clubname;

    // Update the join request status to 'accepted'
    const { error: updateRequestError } = await supabase
      .from("club_requests")
      .update({ status: "accepted" })
      .eq("id", id)
      .eq("userid", userid);

    if (updateRequestError) {
      console.error(
      "Error accepting join request:",
      updateRequestError.message
      );
      return res.status(500).send("Error accepting join request");
    }

    // Update the club column in the users table
    const { error: updateUserError } = await supabase
      .from("users")
      .update({ club: clubid })
      .eq("id", userid);

    if (updateUserError) {
      console.error("Error updating user club:", updateUserError.message);
      return res.status(500).send("Error updating user club");
    }

    // Add a notification for the user about their club join request acceptance
    const { error: notificationError } = await supabase
      .from("notifications")
      .insert([
      {
        userid,
        type: "Club",
        message: `Your request to join the club ${clubname} has been accepted.`,
        desc: `Congratulations! Your request to join the club ${clubname} has been accepted. You are now a member of the club.`,
      },
      ]);

    if (notificationError) {
      console.error("Error creating notification:", notificationError.message);
      return res.status(500).send("Error creating notification");
    }

    // Update the session with the new club
    req.session.user.club = clubname;

    res.redirect("/notifications");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }

});

app.post("/reject-join-club-request", async (req, res) => {
  const { id, userid, clubid } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  try {
    // Update the join request status to 'rejected'
    const { error: updateRequestError } = await supabase
      .from("club_requests")
      .update({ status: "rejected" })
      .eq("id", id)
      .eq("userid", userid);

    if (updateRequestError) {
      console.error("Error rejecting join request:", updateRequestError.message);
      return res.status(500).send("Error rejecting join request");
    }

    // Add a notification for the user about their club join request rejection
    const { error: notificationError } = await supabase
      .from("notifications")
      .insert([
        {
          userid,
          type: "Club",
          message: "Your request to join the club has been rejected.",
          desc: "Unfortunately, your request to join the club has been rejected. Please contact the club for more information.",
        },
      ]);

    if (notificationError) {
      console.error("Error creating notification:", notificationError.message);
      return res.status(500).send("Error creating notification");
    }

    res.redirect(`/clubs-details/${clubid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/accept-invitation/:id", async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const userid = req.session.user.id;

  try {
    // Fetch the invitation details to get the clubname
    const { data: invitation, error: fetchError } = await supabase
      .from("club_invitations")
      .select("*")
      .eq("id", id)
      .eq("invited_user", userid)
      .single();

    if (fetchError || !invitation) {
      console.error(
        "Error fetching invitation:",
        fetchError ? fetchError.message : "Invitation not found"
      );
      return res.status(500).send("Error fetching invitation");
    }

    const clubid = invitation.club_id;

    // Update the invitation status to 'accepted'
    const { error: updateInvitationError } = await supabase
      .from("club_invitations")
      .update({ status: "accepted" })
      .eq("id", id)
      .eq("invited_user", userid);

    if (updateInvitationError) {
      console.error(
        "Error accepting invitation:",
        updateInvitationError.message
      );
      return res.status(500).send("Error accepting invitation");
    }

    // Update the club column in the users table
    const { error: updateUserError } = await supabase
      .from("users")
      .update({ club: clubid })
      .eq("id", userid);

    if (updateUserError) {
      console.error("Error updating user club:", updateUserError.message);
      return res.status(500).send("Error updating user club");
    }

    // Update the session with the new club
    req.session.user.club = clubname;

    res.redirect("/notifications");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/reject-invitation/:id", async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const userid = req.session.user.id;

  try {
    const { data, error } = await supabase
      .from("club_invitations")
      .update({ status: "rejected" })
      .eq("id", id)
      .eq("invited_user", userid);

    if (error) {
      console.error("Error rejecting invitation:", error.message);
      return res.status(500).send("Error rejecting invitation");
    }

    res.redirect("/notifications");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/vote", async (req, res) => {
  const { type, threadId } = req.body;

  if (!req.session.user) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: No user logged in" });
  }

  const userId = req.session.user.id;

  try {
    // Fetch the current thread
    const { data: thread, error: threadError } = await supabase
      .from("forum_threads")
      .select("upvotes, downvotes")
      .eq("id", threadId)
      .single();

    if (threadError) {
      return res
        .status(500)
        .json({ success: false, message: threadError.message });
    }

    let upvotes = thread.upvotes || [];
    let downvotes = thread.downvotes || [];

    // Check if the user has already upvoted or downvoted
    const hasUpvoted = upvotes.includes(userId);
    const hasDownvoted = downvotes.includes(userId);

    // Remove user from both arrays to ensure clean state
    upvotes = upvotes.filter((id) => id !== userId);
    downvotes = downvotes.filter((id) => id !== userId);

    // Add user to the appropriate array based on vote type, or remove if they already voted
    if (type === "upvote") {
      if (!hasUpvoted) {
        upvotes.push(userId);
      }
    } else if (type === "downvote") {
      if (!hasDownvoted) {
        downvotes.push(userId);
      }
    }

    // Update the thread with the new arrays
    const { data, error } = await supabase
      .from("forum_threads")
      .update({ upvotes, downvotes })
      .eq("id", threadId)
      .select();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    res.redirect(`/forum-thread/${threadId}`); // Redirect back to the thread page
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/create-event", upload.single("eventpicture"), async (req, res) => {
  const {
    name,
    description,
    eventtype,
    registrationcap,
    date,
    starttime,
    endtime,
    location,
    agedivision,
    weightclass,
    beltlevel,
    gender,
  } = req.body; // Capture user input from the form

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const createdby = req.session.user.username; // Get the current user's username from the session
  let eventpictureUrl = null;

  if (req.file) {
    try {
      const filePath = `eventpictures/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        console.error("Error uploading event picture:", uploadError.message);
        return res.status(500).send("Error uploading event picture");
      }

      eventpictureUrl = `${supabaseUrl}/storage/v1/object/public/documents/${filePath}`;
    } catch (error) {
      console.error("Server error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    // Insert the new event into the database
    const { data, error } = await supabase
      .from("events")
      .insert([
        {
          name,
          description,
          eventpicture: eventpictureUrl,
          eventtype,
          createdby,
          registrationcap,
          date,
          starttime,
          endtime,
          location,
          agedivision,
          weightclass,
          beltlevel,
          gender,
          status: "Active",
        },
      ])
      .select(); // Ensure the data is returned

    if (error) {
      console.error("Error creating event:", error.message);
      return res.status(500).send("Error creating event");
    }

    console.log("Event created successfully:", data);

    res.redirect("/events"); // Redirect to a success page or another appropriate route
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-event", upload.single("eventpicture"), async (req, res) => {
  const {
    eventid, // Event ID to identify the event to update
    name,
    description,
    date,
    eventtype,
    createdby,
    registrationcap,
    location,
    starttime,
    endtime,
    agedivision,
    beltlevel,
    weightclass,
    status,
    gender,
  } = req.body;

  let eventpicture = null;
  if (req.file) {
    try {
      const filePath = `eventpictures/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        console.error("Error uploading event picture:", uploadError.message);
        return res.status(500).send("Error uploading event picture");
      }

      eventpicture = `${supabaseUrl}/storage/v1/object/public/documents/${filePath}`;
    } catch (error) {
      console.error("Server error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    // Fetch the current event details to retain the old event picture if no new one is uploaded
    if (!eventpicture) {
      const { data: currentEvent, error: fetchError } = await supabase
        .from("events")
        .select("eventpicture")
        .eq("id", eventid)
        .single();

      if (fetchError) {
        console.error("Error fetching current event picture:", fetchError.message);
        return res.status(500).send("Error fetching current event picture");
      }

      eventpicture = currentEvent.eventpicture;
    }

    // Update event details in Supabase database
    const { data, error } = await supabase
      .from("events") // Assuming your table is called 'events'
      .update({
        name: name,
        description: description,
        eventpicture: eventpicture, // Use the public URL of the uploaded image or the old one
        date: date,
        eventtype: eventtype,
        createdby: createdby,
        registrationcap: registrationcap,
        location: location,
        starttime: starttime,
        endtime: endtime,
        status: status,
        agedivision: agedivision,
        beltlevel: beltlevel,
        gender: gender,
        weightclass: weightclass,
      })
      .eq("id", eventid); // Match the event ID

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ message: "Failed to update event", error });
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ message: "Server error, unable to update event" });
  }
});

app.post("/delete-event/:id", async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  try {
    // Delete the event from the database
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting event:", error.message);
      return res.status(500).send("Error deleting event");
    }

    res.redirect("/events");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/delete-club/:id", async (req, res) => {
  const { id } = req.params;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  try {
    // Delete the club from the database
    const { error } = await supabase
      .from("clubs")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting club:", error.message);
      return res.status(500).send("Error deleting club");
    }

    res.redirect("/clubs");
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/submit-player", async (req, res) => {
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
    instructor,
  } = req.body; // Capture user input from the form

  const registered = "false";
  const userid = req.session.user.id;

  try {
    // Insert the new registration into the database
    const { data: registrationData, error: registrationError } = await supabase
      .from("events_registrations")
      .insert([
        {
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
          instructor,
        },
      ]);

    if (registrationError) {
      console.error("Error creating registration:", registrationError.message);
      return res.status(500).send("Error creating registration.");
    }

        // Fetch the event details from the events table
    const { data: thisevent, error: thiseventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventid)
      .single();

    if (thiseventError) {
      console.error("Error fetching event details:", thiseventError.message);
      return res.status(500).send("Error fetching event details.");
    }

    console.log("Fetched event details:", thisevent); // Log the event details to the console

    // Insert a notification for the player about their registration
    const { error: notificationError } = await supabase
      .from("notifications")
      .insert([
      {
      userid: userid,
      type: "Event",
      message: `You have successfully registered for ${thisevent.name}`,
      desc: `Your registration for the event ${thisevent.name} has been successfully submitted. Please wait for approval from the event organizer.`,
      },
      ]);

    if (notificationError) {
      console.error("Error creating notification:", notificationError.message);
      return res.status(500).send("Error creating notification");
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/begin-kyorugi-competition/:id", async (req, res) => {
  const { id: eventid } = req.params; // Get the event ID from the URL

  try {
    // Fetch the event registrations for the specific event
    const { data: eventregistrations, error: eventregistrationsError } =
      await supabase
        .from("events_registrations")
        .select("*")
        .eq("eventid", eventid);

    if (eventregistrationsError) {
      console.error(
        "Error fetching event registrations:",
        eventregistrationsError.message
      );
      return res.status(500).send("Error fetching event registrations.");
    }

    // Fetch the event details to get the registration cap
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventid)
      .single();

    if (eventError) {
      console.error("Error fetching event details:", eventError.message);
      return res.status(500).send("Error fetching event details.");
    }

    // Update the event status to 'Ongoing'
    const { error: updateEventStatusError } = await supabase
      .from("events")
      .update({ status: "Ongoing" })
      .eq("id", eventid);

    if (updateEventStatusError) {
      console.error("Error updating event status:", updateEventStatusError.message);
      return res.status(500).send("Error updating event status.");
    }

    // Check if the registration cap has been reached
    if (eventregistrations.length >= event.registrationcap) {
      // Create pairs for the knockout matches
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

      const pairs = createKnockoutPairs(eventregistrations);
      const round = 1;
      for (const pair of pairs) {
        const { error } = await supabase
          .from("kyorugi_matches")
          .insert([
            {
              eventid,
              player1: pair[0].userid,
              player2: pair[1]?.userid,
              round,
              matchtype: "regular",
            },
          ]);

        if (error) {
          console.error("Error creating matches:", error.message);
          return res.status(500).send("Error creating matches.");
        }
      }
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/next-kyorugi-round/:eventid", async (req, res) => {
  const { eventid } = req.params;

  try {
    const { data: highestRound, error: roundError } = await supabase
      .from("kyorugi_matches")
      .select("round")
      .eq("eventid", eventid)
      .order("round", { ascending: false })
      .limit(1)
      .single();

    if (roundError) {
      console.error("Error fetching highest round:", roundError.message);
      return res.status(500).send("Error fetching highest round");
    }

    const currentRound = highestRound ? highestRound.round : 0;

    const { data: matches, error: matchesError } = await supabase
      .from("kyorugi_matches")
      .select("*")
      .eq("eventid", eventid)
      .eq("round", currentRound)
      .eq("matchtype", "regular");

    if (matchesError) {
      console.error("Error fetching matches:", matchesError.message);
      return res.status(500).send("Error fetching matches");
    }

    const allMatchesCompleted = matches.every(
      (match) => match.winner !== null && match.loser !== null
    );
    if (!allMatchesCompleted) {
      console.log("Not all matches are completed.");
      return res.status(400).send("Not all matches are completed.");
    }

    const winners = matches
      .map((match) => match.winner)
      .filter((winner) => winner !== 0);

    function createPairs(players) {
      const pairs = [];
      for (let i = 0; i < players.length; i += 2) {
        if (players[i + 1]) {
          pairs.push([players[i], players[i + 1]]);
        } else {
          pairs.push([players[i]]); // Handle odd number of participants
        }
      }
      return pairs;
    }

    const pairs = createPairs(winners);
    const nextRound = currentRound + 1;

    if (matches.length === 2) {
      const { error: finalMatchError } = await supabase
        .from("kyorugi_matches")
        .insert([
          {
            eventid,
            player1: pairs[0][0],
            player2: pairs[0][1] || null,
            round: nextRound,
            matchtype: "final",
          },
        ]);

      if (finalMatchError) {
        console.error("Error creating final match:", finalMatchError.message);
      }

      console.log("Final match created.");
    } else {
      for (const pair of pairs) {
        const { error } = await supabase
          .from("kyorugi_matches")
          .insert([
            {
              eventid,
              player1: pair[0],
              player2: pair[1] || null,
              round: nextRound,
              matchtype: "regular",
            },
          ]);

        if (error) {
          console.error("Error creating next round match:", error.message);
        }
      }

      console.log("Next round matches created.");
    }

    // Update the current round in the events table
    const { error: updateRoundError } = await supabase
      .from("events")
      .update({ currentround: nextRound })
      .eq("id", eventid);

    if (updateRoundError) {
      console.error("Error updating current round:", updateRoundError.message);
      return res.status(500).send("Error updating current round");
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/decide-kyorugi-winners/:eventid", async (req, res) => {
  const { eventid } = req.params;

  try {

    // Update the event status to "Concluded"
    const { error: updateEventStatusError } = await supabase
      .from("events")
      .update({ status: "Concluded" })
      .eq("id", eventid);

    if (updateEventStatusError) {
      console.error("Error updating event status:", updateEventStatusError.message);
      return res.status(500).send("Error updating event status");
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/begin-poomsae-competition/:id", async (req, res) => {

  const { id: eventid } = req.params; // Get the event ID from the URL

    try {
      // Fetch all registered players for the event
      const { data: players, error: playersError } = await supabase
        .from("events_registrations")
        .select("*")
        .eq("eventid", eventid)
        .eq("registered", "TRUE");

      if (playersError) {
        console.error("Error fetching registered players:", playersError.message);
        return;
      }
      
      // Insert all players' userid and athlete id into the poomsae_players table
      for (const player of players) {
        // Check if the player already exists in the poomsae_players table
        const { data: existingPlayer, error: fetchError } = await supabase
          .from("poomsae_players")
          .select("*")
          .eq("eventid", eventid)
          .eq("userid", player.userid)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error("Error checking existing poomsae player:", fetchError.message);
          continue;
        }

        if (!existingPlayer) {
          const { error: insertError } = await supabase
        .from("poomsae_players")
        .insert([
          {
            eventid,
            userid: player.userid,
            athleteid: player.athleteid,
            round: 1,
            name: player.playername,
          },
        ]);

          if (insertError) {
        console.error("Error inserting poomsae player:", insertError.message);
          }
        }
      }

      const { error: updateEventError } = await supabase
        .from("events")
        .update({ 
          status: "Ongoing",
          currentround: 1,
         })
        .eq("id", eventid);

      if (updateEventError) {
        console.error("Error updating event status:", updateEventError.message);
        return res.status(500).send("Error updating event status");
      }

      console.log("Poomsae players inserted successfully");
    } catch (error) {
      console.error("Server error:", error.message);
    }

  res.redirect(`/events-details/${req.params.id}`);
});

app.post("/next-poomsae-round/:eventid", async (req, res) => {
  const { eventid } = req.params;

  try {
    // Fetch the highest round number for the event
    const { data: highestRound, error: highestRoundError } = await supabase
      .from("poomsae_players")
      .select("round")
      .eq("eventid", eventid)
      .order("round", { ascending: false })
      .limit(1)
      .single();

    if (highestRoundError) {
      console.error("Error fetching highest round:", highestRoundError.message);
      return res.status(500).send("Error fetching highest round");
    }

    const currentRound = highestRound ? highestRound.round : 0;

    // Fetch players who participated in the current round
    const { data: players, error: playersError } = await supabase
      .from("poomsae_players")
      .select("*")
      .eq("eventid", eventid)
      .eq("round", currentRound);

    if (playersError) {
      console.error("Error fetching players:", playersError.message);
      return res.status(500).send("Error fetching players");
    }

    // Update the current round in the events table
    const { error: updateRoundError } = await supabase
      .from("events")
      .update({ currentround: currentRound + 1 })
      .eq("id", eventid);

    if (updateRoundError) {
      console.error("Error updating current round:", updateRoundError.message);
      return res.status(500).send("Error updating current round");
    }

    // Determine the players who advance to the next round based on their scores
    const advancingPlayers = players
      .sort((a, b) => b.totalscore - a.totalscore)
      .slice(0, players.length >= 35 ? 12 : 8); // 12 advance if 35 or more participants, else 8 advance

    const nextRound = currentRound + 1;

    // Insert advancing players into the next round, carrying over their total scores
    for (const player of advancingPlayers) {
      const { error: insertError } = await supabase
        .from("poomsae_players")
        .insert([
          {
            eventid,
            userid: player.userid,
            athleteid: player.athleteid,
            round: nextRound,
            name: player.name,
            totalscore: player.totalscore, // Carry over the total score
          },
        ]);

      if (insertError) {
        console.error("Error advancing player:", insertError.message);
        return res.status(500).send("Error advancing player");
      }
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/decide-poomsae-winners/:eventid", async (req, res) => {
  const { eventid } = req.params;

  try {

    // Fetch all events using eventid
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventid)
      .single();

    if (eventsError) {
      console.error("Error fetching events:", eventsError.message);
      return res.status(500).send("Error fetching events");
    }

    console.log("Fetched events data:", events); // Log the events data to the console
    // Update the current round in the events table
    const { error: updateRoundError } = await supabase
      .from("events")
      .update({ currentround: 3 })
      .eq("id", eventid);

    if (updateRoundError) {
      console.error("Error updating current round:", updateRoundError.message);
      return res.status(500).send("Error updating current round");
    }

    // Fetch the highest round number for the event
    const { data: highestRound, error: highestRoundError } = await supabase
      .from("poomsae_players")
      .select("round")
      .eq("eventid", eventid)
      .order("round", { ascending: false })
      .limit(1)
      .single();

    if (highestRoundError) {
      console.error("Error fetching highest round:", highestRoundError.message);
      return res.status(500).send("Error fetching highest round");
    }

    const currentRound = highestRound ? highestRound.round : 0;

    // Fetch players who participated in the highest round
    const { data: players, error: playersError } = await supabase
      .from("poomsae_players")
      .select("*")
      .eq("eventid", eventid)
      .eq("round", currentRound)
      .order("totalscore", { ascending: false });

    if (playersError) {
      console.error("Error fetching players:", playersError.message);
      return res.status(500).send("Error fetching players");
    }

    // Update the ranking for all players in the last round
    for (let i = 0; i < players.length; i++) {
      const ranking = i < 4 ? i + 1 : 0; // Assign ranking 1-4, and 0 for others
      const { error: updateError } = await supabase
      .from("poomsae_players")
      .update({ ranking })
      .eq("id", players[i].id);

      if (updateError) {
      console.error("Error updating ranking:", updateError.message);
      return res.status(500).send("Error updating ranking");
      }
    }

    // Insert each player's match history into the match_history table
    for (const player of players) {
      const { error: matchHistoryError } = await supabase
        .from("match_history")
        .insert([
          {
            eventid,
            athleteid: player.athleteid,
            ranking: player.ranking,
            eventname: events.name,
            eventlocation: events.location,
          },
        ]);

      if (matchHistoryError) {
        console.error("Error inserting match history:", matchHistoryError.message);
        return res.status(500).send("Error inserting match history");
      }
    }

    // Update the event status to "Concluded"
    const { error: updateEventStatusError } = await supabase
      .from("events")
      .update({ status: "Concluded" })
      .eq("id", eventid);

    if (updateEventStatusError) {
      console.error("Error updating event status:", updateEventStatusError.message);
      return res.status(500).send("Error updating event status");
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-eventreg-status", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const { applicationId, registered } = req.body; // Capture application ID and new status from the form

  try {
    // Update the status of the specific registration in the database
    const { data: registration, error: updateStatusError } = await supabase
      .from("events_registrations")
      .update({ registered })
      .eq("id", applicationId)
      .single();

    if (updateStatusError) {
      console.error("Error updating status:", updateStatusError.message);
      return res.status(500).send("Error updating status");
    }

    // Fetch the event registration details using the applicationId
    const { data: eventRegistration, error: eventRegistrationError } = await supabase
      .from("events_registrations")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (eventRegistrationError) {
      console.error("Error fetching event registration:", eventRegistrationError.message);
      return res.status(500).send("Error fetching event registration");
    }

    // Add a notification for the user about their event registration status
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("username")
      .eq("id", eventRegistration.userid)
      .single();

    if (userError) {
      console.error("Error fetching user:", userError.message);
      return res.status(500).send("Error fetching user");
    }

    // Fetch the event details from the events table
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventRegistration.eventid)
      .single();

    if (eventError) {
      console.error("Error fetching event details:", eventError.message);
      return res.status(500).send("Error fetching event details");
    }

    const notificationMessage = registered === "true" 
      ? `Your registration for the event ${event.name} has been accepted.` 
      : `Your registration for the event ${event.name} has been rejected.`;

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert([
        {
          userid: eventRegistration.userid,
          type: "Event",
          message: notificationMessage,
          desc: `You are now listed to compete at ${event.name}. Take note of your check-in code for easy entry`,
        },
      ]);

    if (notificationError) {
      console.error("Error creating notification:", notificationError.message);
      return res.status(500).send("Error creating notification");
    }

    console.log("Registration updated:", registration);
    res.redirect(`/events-review-registration/${applicationId}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/follow-topic/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const userId = req.session.user.id;
  const topicId = req.params.id;

  try {
    // Fetch the current followers array
    const { data: topic, error: fetchError } = await supabase
      .from("forum_topics")
      .select("followers")
      .eq("id", topicId)
      .single();

    if (fetchError) {
      return res.status(500).send("Error fetching topic followers");
    }

    // Add the current user to the followers array if not already in it
    const updatedFollowers = topic.followers || [];
    if (!updatedFollowers.includes(userId)) {
      updatedFollowers.push(userId);
    }

    // Update the topic with the new followers array
    const { data, error: updateError } = await supabase
      .from("forum_topics")
      .update({ followers: updatedFollowers })
      .eq("id", topicId);

    if (updateError) {
      return res.status(500).send("Error following topic");
    }

    res.redirect("/forum");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/unfollow-topic/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  const userId = req.session.user.id;
  const topicId = req.params.id;

  try {
    // Fetch the current followers array
    const { data: topic, error: fetchError } = await supabase
      .from("forum_topics")
      .select("followers")
      .eq("id", topicId)
      .single();

    if (fetchError) {
      return res.status(500).send("Error fetching topic followers");
    }

    // Remove the current user from the followers array if present
    const updatedFollowers = (topic.followers || []).filter(
      (follower) => follower !== userId
    );

    // Update the topic with the new followers array
    const { data, error: updateError } = await supabase
      .from("forum_topics")
      .update({ followers: updatedFollowers })
      .eq("id", topicId);

    if (updateError) {
      return res.status(500).send("Error unfollowing topic");
    }

    res.redirect("/forum");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/create-club-announcement", async (req, res) => {
  const { title, subject, body, originalposter, profilepic, clubid } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  try {
    const { data, error } = await supabase.from("club_announcements").insert([
      {
        title,
        subject,
        body,
        originalposter,
        profilepic,
        clubid,
      },
    ]);

    if (error) {
      return res.status(500).render("announcements", {
        error: "Error creating announcement.",
        user: req.session.user,
      });
    }

    res.redirect(`/clubs-details/${clubid}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-club", upload.single("clubpicture"), async (req, res) => {
  const {
    clubid,
    clubname,
    clubaddress,
    email,
    phonenum,
    region,
    description,
    existingClubPicture // The hidden input from the form
  } = req.body;

  // Set `clubpicUrl` to the existing picture by default
  let clubpicUrl = existingClubPicture;

  if (req.file) {
    // If a new file is uploaded, update `clubpicUrl` with the new file URL
    try {
      const filePath = `clubpictures/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        console.error("Error uploading club picture:", uploadError.message);
        return res.status(500).send("Error uploading club picture");
      }

      clubpicUrl = `${supabaseUrl}/storage/v1/object/public/documents/${filePath}`;
    } catch (error) {
      console.error("Server error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    // Update the club in the database with either the new picture or the existing one
    const { data, error } = await supabase
      .from("clubs")
      .update({
        clubname,
        clubaddress,
        email,
        phonenum,
        region,
        description,
        clubpic: clubpicUrl // Use the existing or new picture URL
      })
      .eq("id", clubid);

    if (error) {
      return res.status(500).json({ message: "Error updating club", error });
    }

    res.redirect(`/clubs-details/${clubid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});


app.post("/create-event-announcement", async (req, res) => {
  const { title, subject, body, eventid } = req.body;

  if (!req.session.user) {
    return res.status(401).send("Unauthorized: No user logged in");
  }

  try {
    const { error } = await supabase.from("event_announcements").insert([
      {
        title,
        subject,
        body,
        eventid,
      },
    ]);

    if (error) {
      return res.status(500).render("events", {
        error: "Error creating announcement.",
        user: req.session.user,
      });
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/submit-kyorugi-scores", async (req, res) => {
  const { matchid, player1_total, player2_total, eventid, player1, player2 } =
    req.body;

  const player1score = player1_total;
  const player2score = player2_total;

  let winner, loser;
  if (player1score > player2score) {
    winner = player1;
    loser = player2;
  } else if (player2score > player1score) {
    winner = player2;
    loser = player1;
  } else {
    winner = 0; // In case of a tie
    loser = 0;
  }

  try {
    const { error } = await supabase
      .from("kyorugi_matches")
      .update({ 
        player1score,
        player2score, 
        winner, 
        loser
      })
      .eq("id", matchid);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    /* await createNextRound(eventid);*/

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/submit-poomsae-scores", async (req, res) => {
  const {
    basicmovement,
    indivmovement,
    balance,
    powerspeed,
    coord,
    energy,
    id,
    eventid,
  } = req.body;

  
  const technicalscore = 4-parseFloat(basicmovement) -parseFloat(indivmovement) - parseFloat(balance);
  const performancescore = 6 - parseFloat(powerspeed) - parseFloat(coord) - parseFloat(energy);
  const totalscore = parseFloat(technicalscore) + parseFloat(performancescore);

  try {
    const { error } = await supabase.from("poomsae_players")
    .update({ 
      totalscore: totalscore,
      performancescore: performancescore,
      technicalscore: technicalscore, 
     })
    .eq("id", id); // Ensure you pass the player ID in the request body

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-matchtime", async (req, res) => {
  const { id, matchtime, eventid } = req.body;

  try {
    // Fetch the current match details to compare the matchtime
    const { data: currentMatch, error: currentMatchError } = await supabase
      .from("kyorugi_matches")
      .select("*")
      .eq("id", id)
      .single();

    if (currentMatchError) {
      return res.status(400).json({ error: currentMatchError.message });
    }

    // Update the matchtime in the matches table
    const { error } = await supabase
      .from("kyorugi_matches")
      .update({ matchtime })
      .eq("id", id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Only create notifications if the matchtime has changed
    if (currentMatch.matchtime !== matchtime) {
      // Create notifications for both players
      // Fetch the event name
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("name")
        .eq("id", eventid)
        .single();

      if (eventError) {
        console.error("Error fetching event name:", eventError.message);
        return res.status(500).send("Error fetching event name");
      }

      const notifications = [
        {
          userid: currentMatch.player1,
          type: "Event",
          message: `Your match time for ${event.name} has been updated to ${matchtime}.`,
          desc: `Please be ready for your match at the new scheduled time.`,
        },
        {
          userid: currentMatch.player2,
          type: "Event",
          message: `Your match time for ${event.name} has been updated to ${matchtime}.`,
          desc: `Please be ready for your match at the new scheduled time.`,
        },
      ];

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notificationError) {
        console.error("Error creating notifications:", notificationError.message);
        return res.status(500).send("Error creating notifications");
      }
    }

    res.redirect(`/events-details/${eventid}`);
  } catch (error) {
    console.error("Error updating matchtime:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/update-points", async (req, res) => {
  const { userid, points } = req.body;

  try {
    // Fetch the current ranking points for the user
    const { data: athlete, error: fetchError } = await supabase
      .from("athletes")
      .select("rankingpoints")
      .eq("userid", userid)
      .single();

    if (fetchError) {
      return res.status(400).json({ error: fetchError.message });
    }

    // Calculate the new total points
    const currentPoints = athlete.rankingpoints || 0;
    const newTotalPoints = currentPoints + parseInt(points, 10);

    // Update the ranking points for the user
    const { error: updateError } = await supabase
      .from("athletes")
      .update({ rankingpoints: newTotalPoints })
      .eq("userid", userid);

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    res.redirect("back"); // Redirect back to the previous page
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/update-athlete-status', async (req, res) => {
  const { id, status } = req.body;

  try {
    // Update the status in the database using Supabase
    const { error } = await supabase
      .from('athletes') // Ensure this table name matches your actual table name
      .update({ status: status })
      .eq('id', id); // Ensure you're updating the correct row based on the athlete ID

    if (error) {
      console.error('Error updating status:', error);
      return res.status(500).json({ success: false, error: 'Database update failed' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});




// VIEWS BELOW

app.get("/home", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(4);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the home.hbs template with both the fetched data and the session user data
    res.render("home", { events: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/forum", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const userId = req.session.user.id; // Assuming user ID is stored in the session

  try {
    // Fetch all topics
    const { data: topics, error: topicsError } = await supabase
      .from("forum_topics")
      .select("*");

    if (topicsError) {
      return res.status(400).json({ error: topicsError.message });
    }

    // Mark topics as followed or not followed by the current user
    const markedTopics = topics.map((topic) => {
      const followers = topic.followers || []; // Ensure followers is an array
      topic.followed = followers.includes(userId);
      return topic;
    });

    // Fetch threads that belong to the followed topics
    const followedTopicIds = markedTopics
      .filter((topic) => topic.followed)
      .map((topic) => topic.id);
    const { data: threads, error: threadsError } = await supabase
      .from("forum_threads")
      .select("*")
      .in("topicid", followedTopicIds);

    if (threadsError) {
      return res.status(400).json({ error: threadsError.message });
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("ptaverified")
      .eq("id", userId)
      .single();

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    // Determine if the user is an admin based on ptaverified
    const isAdmin = userData.ptaverified === true;

    console.log("Fetched threads:", threads); // Log the threads data to the console
    console.log("Fetched topics:", markedTopics); // Log the topics data to the console

    // Render the forum.hbs template with the fetched data
    res.render("forum", {
      forum_threads: threads,
      forum_topics: markedTopics,
      user: { ...req.session.user, isAdmin },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/delete-topic/:id", async (req, res) => {
  

  const topicId = req.params.id;

  try {
    const { error } = await supabase
      .from("forum_topics")
      .delete()
      .eq("id", topicId);

    if (error) {
      console.error("Error deleting topic:", error.message);
      return res.status(500).send("Error deleting topic");
    }

    res.redirect("/forum"); // Redirect after successful deletion
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).send("Server error");
  }
});

app.get("/forum-create", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data: threads, error: threadsError } = await supabase
      .from("forum_threads")
      .select("*");

    if (threadsError) {
      return res.status(400).json({ error: threadsError.message });
    }

    const { data: topics, error: topicsError } = await supabase
      .from("forum_topics")
      .select("*");

    if (topicsError) {
      return res.status(400).json({ error: topicsError.message });
    }

    console.log("Fetched threads data:", threads); // Log the threads data to the console
    console.log("Fetched topics data:", topics); // Log the topics data to the console

    // Render the forum-create.hbs template with the fetched data
    res.render("forum-create", {
      forum_threads: threads,
      forum_topics: topics,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/forum-thread/:id", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const threadId = req.params.id;

  try {
    // Fetch the specific thread data
    const { data: thread, error: threadError } = await supabase
      .from("forum_threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError) {
      return res.status(400).json({ error: threadError.message });
    }

    console.log("Fetched thread data:", thread);

    // Fetch the comments for this thread
    const { data: comments, error: commentsError } = await supabase
      .from("forum_comments")
      .select("*")
      .eq("threadid", threadId);

    if (commentsError) {
      return res.status(400).json({ error: commentsError.message });
    }

    console.log("Fetched comments data:", comments);

    // Render the forum-thread.hbs template with the fetched data
    res.render("forum-thread", { thread, comments, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to render the main clubs page
app.get("/clubs", async (req, res) => {

  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data: clubs, error } = await supabase
      .from("clubs")
      .select("id, clubname, clubpic, clubaddress, email, phonenum, region, description, capacity");

    if (error) {
      console.error("Error fetching clubs:", error.message);
      return res.status(500).json({ error: error.message });
    }

    res.render("clubs", { 
      clubs,
      user: req.session.user,
     });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});


app.get("/clubs-details/:id", async function (req, res) {
  const { id } = req.params;

  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data: club, error: clubsError } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", id)
      .single();


    if (clubsError) {
      return res.status(400).json({ clubsError: clubsError.message });
    }

    const { data: allUsers, error: allUsersError } = await supabase
      .from("users")
      .select("*");

    if (allUsersError) {
      return res.status(400).json({ allUsersError: allUsersError.message });
    }

    const { data: athletes, error: athleteserror } = await supabase
      .from("athletes")
      .select("*");

    if (athleteserror) {
      return res.status(400).json({ athleteserror: athleteserror.message });
    }

    const { data: announcements, error: announcementserror } = await supabase
      .from("club_announcements")
      .select("*")
      .eq("clubid", id);

    if (announcementserror) {
      return res
        .status(400)
        .json({ announcementserror: announcementserror.message });
    }

    const { data: club_requests, error: club_requestsError } = await supabase
      .from("club_requests")
      .select("*")
      .eq("clubid", id);

    if (club_requestsError) {
      return res.status(400).json({ club_requestsError: club_requestsError.message });
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, firstname, lastname");

    if (usersError) {
      return res.status(400).json({ usersError: usersError.message });
    }

    // Merge user data with club requests
    const clubRequestsWithUserDetails = club_requests.map((request) => {
      const user = users.find((user) => user.id === request.userid);
      return {
        ...request,
        firstname: user ? user.firstname : null,
        lastname: user ? user.lastname : null,
      };
    });
    

    const clubMembers = athletes.filter(
      (athlete) => athlete.club === club.clubname
    );

    // Render the clubs-details.hbs template with the fetched data
    res.render("clubs-details", {
      club,
      allUsers,
      clubMembers,
      announcements,
      club_requests,
      clubRequestsWithUserDetails,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/clubs-manage", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase
      .from("clubs") //need to change to clubs after
      .select("*");

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the forum.hbs template with the fetched data
    res.render("clubs-manage", { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message, user: req.session.user });
  }
});

app.get("/membership", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase
      .from("clubs") //need to change to clubs after
      .select("*");

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the forum.hbs template with the fetched data
    res.render("membership", { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message, user: req.session.user });
  }
});

app.get("/events", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase
      .from("events") //need to change to clubs after
      .select("*");

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the forum.hbs template with the fetched data
    res.render("events", { events: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/events-create/:type", async function (req, res) {
  const { type } = req.params; // Correctly capture the type parameter

  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase.from("events").select("*");

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the events-create.hbs template with the fetched data
    res.render("events-create", {
      events: data,
      user: req.session.user,
      eventtype: type,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/events-registration/:id", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const { id } = req.params; // Get the event ID from the URL
  const userId = req.session.user.id; // Get the user ID from the session

  try {
    // Fetch the event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();

    if (eventError) {
      return res.status(400).json({ error: eventError.message });
    }

    // Fetch the athlete details for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("*")
      .eq("userid", userId)
      .single();

    if (athleteError) {
      return res.status(400).json({ error: athleteError.message });
    }

    res.render("events-registration", {
      event,
      athlete,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/events-review-registration/:id", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const { id } = req.params; // Get the event registration ID from the URL
  const userId = req.session.user.id; // Get the user ID from the session

  try {
    // Fetch the event registration details
    const { data: eventregistration, error: eventregError } = await supabase
      .from("events_registrations")
      .select("*")
      .eq("id", id)
      .single();

    if (eventregError) {
      return res.status(400).json({ error: eventregError.message });
    }

    // Fetch the event details using the eventid from the event registration
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventregistration.eventid)
      .single();

    if (eventError) {
      return res.status(400).json({ error: eventError.message });
    }

    // Fetch the athlete details for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("*")
      .eq("userid", userId)
      .single();

    if (athleteError) {
      return res.status(400).json({ error: athleteError.message });
    }

    res.render("events-review-registration", {
      eventregistration,
      event,
      athlete,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/events-details/:id", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const { id } = req.params; // Get the event ID from the URL
  const userId = req.session.user.id; // Get the user ID from the session

  try {
    // Fetch the event details from the events table
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();

    if (eventError) {
      return res.status(400).json({ error: eventError.message });
    }

    // Fetch the event registrations for the specific event
    const { data: eventregistrations, error: eventregistrationsError } =
      await supabase
      .from("events_registrations")
      .select("*")
      .eq("eventid", id);

    if (eventregistrationsError) {
      return res.status(400).json({ error: eventregistrationsError.message });
    }

    const { data: pendingregs, error: pendingregsError } = await supabase
      .from("events_registrations")
      .select("*")
      .eq("eventid", id)
      .eq("registered", "false")
      .order("created_at", { ascending: true });

    if (pendingregsError) {
      return res.status(400).json({ error: pendingregsError.message });
    }

    // Fetch the participants for the specific event
    const { data: participants, error: participantsError } = await supabase
      .from("events_registrations")
      .select("*")
      .eq("registered", "true")
      .eq("eventid", id);

    if (participantsError) {
      return res.status(400).json({ error: participantsError.message });
    }

    // Check if the current user is already registered for the event
    const { data: currentregistrant, error: currentregistrantError } =
      await supabase
        .from("events_registrations")
        .select("*")
        .eq("userid", userId)
        .eq("eventid", id)
        .single(); // Use .single() since we're checking for a specific user's registration

    if (currentregistrantError && currentregistrantError.code !== "PGRST116") {
      // PGRST116 indicates no rows found, which is okay in this context
      return res.status(400).json({ error: currentregistrantError.message });
    }

    // Fetch the matches for the specific event and order them by id
    const { data: matches, error: matchesError } = await supabase
      .from("kyorugi_matches")
      .select("*")
      .eq("eventid", id)
      .order("id", { ascending: true });

    if (matchesError) {
      return res.status(400).json({ error: matchesError.message });
    }
    // Fetch kyorugi matches and combine with athlete data
    const { data: kyorugiMatches, error: kyorugiMatchesError } = await supabase
      .from("kyorugi_matches")
      .select("*")
      .eq("eventid", id);

    if (kyorugiMatchesError) {
      return res.status(400).json({ error: kyorugiMatchesError.message });
    }

    // Fetch athlete data for player1 and player2
    const playerIds = [
      ...new Set([
      ...kyorugiMatches.map((match) => match.player1),
      ...kyorugiMatches.map((match) => match.player2),
      ]),
    ];
    
    const { data: eventannouncements } = await supabase
      .from("event_announcements")
      .select("*")
      .eq("eventid", id)
      .order("id", { ascending: true });

    if (matchesError) {
      return res.status(400).json({ error: matchesError.message });
    }

    // Fetch player names and winner names for each match
    for (let match of matches) {
      if (match.player1) {
        const { data: player1, error: player1Error } = await supabase
          .from("athletes")
          .select("name")
          .eq("userid", match.player1)
          .single();

        if (player1Error) {
          return res
            .status(400)
            .json({ error: "Error fetching player1 name." });
        }

        match.player1_name = player1.name;
      }

      if (match.player2) {
        const { data: player2, error: player2Error } = await supabase
          .from("athletes")
          .select("name")
          .eq("userid", match.player2)
          .single();

        if (player2Error) {
          return res
            .status(400)
            .json({ error: "Error fetching player2 name." });
        }

        match.player2_name = player2.name;
      }

      if (match.winner) {
        const { data: winner, error: winnerError } = await supabase
          .from("athletes")
          .select("name")
          .eq("userid", match.winner)
          .single();

        if (winnerError) {
          return res.status(400).json({ error: "Error fetching winner name." });
        }

        match.winner_name = winner.name;
      } else {
        match.winner_name = "TBD"; // Or set to an appropriate default value
      }
    }

    // Determine the champion, 2nd place, and 3rd place
    // let champion = null;
    // let secondPlace = null;
    // let thirdPlace = null;

    // if (matches.length > 0) {
    //   const finalMatch = matches.find((match) => match.matchtype === "final");
    //   if (finalMatch && finalMatch.winner) {
    //     const { data: finalWinner, error: finalWinnerError } = await supabase
    //       .from("athletes")
    //       .select("name, userid")
    //       .eq("userid", finalMatch.winner)
    //       .single();

    //     if (finalWinnerError) {
    //       return res
    //         .status(400)
    //         .json({ error: "Error fetching champion name." });
    //     }

    //     champion = finalWinner;

    //     // Determine second place (loser of the final match)
    //     const secondPlaceId =
    //       finalMatch.winner === finalMatch.player1
    //         ? finalMatch.player2
    //         : finalMatch.player1;
    //     const { data: secondPlaceAthlete, error: secondPlaceError } =
    //       await supabase
    //         .from("athletes")
    //         .select("name, userid")
    //         .eq("userid", secondPlaceId)
    //         .single();

    //     if (secondPlaceError) {
    //       return res
    //         .status(400)
    //         .json({ error: "Error fetching second place name." });
    //     }

    //     secondPlace = secondPlaceAthlete;

    //     // Determine third place (winner of the 3rd place match)
    //     const thirdPlaceMatch = matches.find(
    //       (match) => match.matchtype === "thirdPlace"
    //     );
    //     if (thirdPlaceMatch && thirdPlaceMatch.winner) {
    //       const { data: thirdPlaceWinner, error: thirdPlaceWinnerError } =
    //         await supabase
    //           .from("athletes")
    //           .select("name, userid")
    //           .eq("userid", thirdPlaceMatch.winner)
    //           .single();

    //       if (thirdPlaceWinnerError) {
    //         return res
    //           .status(400)
    //           .json({ error: "Error fetching third place name." });
    //       }

    //       thirdPlace = thirdPlaceWinner;
    //     }
    //   }
    // }

    // Determine the champion, second place, and third place
    let champion = null;
    let secondPlace = null;
    let thirdPlace1 = null;
    let thirdPlace2 = null;

    if (matches.length > 0) {
      const finalMatch = matches.find((match) => match.matchtype === "final");
      if (finalMatch && finalMatch.winner) {
      const { data: finalWinner, error: finalWinnerError } = await supabase
        .from("athletes")
        .select("name, userid")
        .eq("userid", finalMatch.winner)
        .single();

      if (finalWinnerError) {
        return res.status(400).json({ error: "Error fetching champion name." });
      }

      champion = finalWinner;

      // Determine second place (loser of the final match)
      const secondPlaceId =
        finalMatch.winner === finalMatch.player1
        ? finalMatch.player2
        : finalMatch.player1;
      const { data: secondPlaceAthlete, error: secondPlaceError } = await supabase
        .from("athletes")
        .select("name, userid")
        .eq("userid", secondPlaceId)
        .single();

      if (secondPlaceError) {
        return res.status(400).json({ error: "Error fetching second place name." });
      }

      secondPlace = secondPlaceAthlete;

      const { data: highestRound, error: highestRoundError } = await supabase
        .from("kyorugi_matches")
        .select("round")
        .eq("eventid", id)
        .order("round", { ascending: false })
        .limit(1)
        .single();

      if (highestRoundError) {
        return res.status(400).json({ error: highestRoundError.message });
      }

      const currentRound = highestRound ? highestRound.round : 0;

      // Determine third place (losers of the semifinal matches)
      const semifinalMatches = matches.filter((match) => match.round === currentRound - 1);
      if (semifinalMatches.length >= 2) {
        const loser1Id = semifinalMatches[0].winner === semifinalMatches[0].player1 ? semifinalMatches[0].player2 : semifinalMatches[0].player1;
        const loser2Id = semifinalMatches[1].winner === semifinalMatches[1].player1 ? semifinalMatches[1].player2 : semifinalMatches[1].player1;

        const { data: thirdPlaceAthlete1, error: thirdPlaceError1 } = await supabase
        .from("athletes")
        .select("name, userid")
        .eq("userid", loser1Id)
        .single();

        if (thirdPlaceError1) {
        return res.status(400).json({ error: "Error fetching third place name." });
        }

        const { data: thirdPlaceAthlete2, error: thirdPlaceError2 } = await supabase
        .from("athletes")
        .select("name, userid")
        .eq("userid", loser2Id)
        .single();

        if (thirdPlaceError2) {
        return res.status(400).json({ error: "Error fetching third place name." });
        }

        thirdPlace1 = thirdPlaceAthlete1;
        thirdPlace2 = thirdPlaceAthlete2;
      }
      }
    }

    console.log("Third placefsadfsadfsadfsdf:", thirdPlace1); // Log the third place data to the console

    // Fetch the poomsae players for the specific event
    const { data: poomsaePlayers, error } = await supabase
      .from('poomsae_players')
      .select('*')
      .eq('eventid', id)
      .order('totalscore', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const groupedByRound = poomsaePlayers.reduce((acc, player) => {
      const round = player.round;
      if (!acc[round]) {
      acc[round] = [];
      }
      acc[round].push(player);
      return acc;
    }, {});

    // Sort rounds in descending order
    const sortedGroupedByRound = Object.keys(groupedByRound)
      .sort((a, b) => b - a)
      .reduce((acc, key) => {
      acc[key] = groupedByRound[key];
      return acc;
      }, {});

    // Calculate the number of registrations
    const registrationcount = participants.length;

    // Fetch the top 4 players with the highest totalscore
    const { data: poomsaetop4, error: poomsaetop4Error } = await supabase
      .from("poomsae_players")
      .select("*")
      .eq("eventid", id)
      .in("ranking", [1, 2, 3, 4])
      .order("ranking", { ascending: true });

    if (poomsaetop4Error) {
      return res.status(400).json({ error: poomsaetop4Error.message });
    }

    const { data: poomsaeresults, error: poomsaeresultsError } = await supabase
      .from("poomsae_players")
      .select("*")
      .eq("eventid", id)
      .order("totalscore", { ascending: false });

    if (poomsaeresultsError) {
      return res.status(400).json({ error: poomsaeresultsError.message });
    }

    console.log("Fetched top players data:", poomsaetop4); // Log the top players data to the console

    console.log("Fetched event data:", event); // Log the event data to the console
    console.log("Fetched event registrations data:", eventregistrations); // Log the event registrations data to the console
    console.log("Fetched participants data:", participants); // Log the participants data to the console
    console.log("Fetched current registrant data:", currentregistrant); // Log the current registrant data to the console
    console.log("Fetched matches data:", matches); // Log the matches data to the console
    console.log("Fetched poomsae players data:", poomsaePlayers); // Log the poomsae players data to the console

    // Render the events-details.hbs template with the fetched data
    res.render("events-details", {
      event,
      eventregistrations,
      participants,
      pendingregs,
      currentregistrant,
      matches,
      poomsaePlayers,
      poomsaeresults,
      registrationcount,
      registrationcap: event.registrationcap, // Assuming the registration cap is stored in the event table
      user: req.session.user,
      champion,
      secondPlace,
      thirdPlace1,
      thirdPlace2,
      eventannouncements,
      sortedGroupedByRound,
      poomsaetop4,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/profile", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const userId = req.session.user.id;

  try {
    // Check if the user is athlete verified
    const athleteVerified = req.session.user.athleteverified;

    let athlete = null;
    if (athleteVerified) {
      // Fetch the athlete's data
      const { data, error } = await supabase
        .from("athletes")
        .select("*")
        .eq("userid", userId)
        .single();

      if (error) {
        console.error("Error fetching athlete data:", error.message);
        return res.status(500).json({ error: error.message });
      }

      athlete = data;
    }

    // Render the profile template with the user session data and athlete data (if applicable)
    res.render("profile", { user: req.session.user, athlete });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/athletes", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const userId = req.session.user.id;
  try {
    // Fetch athletes data sorted by ranking points in descending order
    const { data: athletes, error: athletesError } = await supabase
      .from("athletes")
      .select("*")
      .order("rankingpoints", { ascending: false });

    if (athletesError) {
      return res.status(400).json({ error: athletesError.message });
    }

    // Fetch clubs data
    const { data: clubs, error: clubsError } = await supabase
      .from("clubs")
      .select("*")
      .eq("registeree", userId);
      

    if (clubsError) {
      return res.status(400).json({ error: clubsError.message });
    }
    // Fetch user data to get the club information
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, club");

    if (usersError) {
      return res.status(400).json({ error: usersError.message });
    }

    const { data: userData, error: userError } = await supabase
    .from("users")
    .select("ptaverified")
    .eq("id", userId)
    .single();

  if (userError) {
    return res.status(400).json({ error: userError.message });
  }

  // Determine if the user is an admin based on ptaverified
  const isAdmin = userData.ptaverified === true;

    // Merge the club information with the athletes data
    athletes.forEach((athlete) => {
      const user = users.find((user) => user.id === athlete.userid);
      athlete.club = user ? user.club : "N/A";
    });

    console.log("Fetched athletes data:", athletes); // Log the athletes data to the console
    console.log("Fetched clubs data:", clubs); // Log the clubs data to the console

    // Render the athletes.hbs template with the fetched data
    res.render("athletes", { athletes, clubs, user: { ...req.session.user, isAdmin }, });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/athletes-profile/:athleteid", async function (req, res) {
  const { athleteid } = req.params;

  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    // Fetch athlete data
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("*")
      .eq("id", athleteid)
      .single();

    if (athleteError) {
      return res.status(400).json({ error: athleteError.message });
    }

    // Fetch match data
    const { data: matchdata, error: matchError } = await supabase
      .from("match_history")
      .select("*")
      .eq("athleteid", athleteid);

    if (matchError) {
      return res.status(400).json({ error: matchError.message });
    }

    // Fetch the most recent match data
    const { data: recentmatch, error: recentmatchError } = await supabase
      .from("match_history")
      .select("*")
      .eq("athleteid", athleteid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentmatchError) {
      return res.status(400).json({ error: recentmatchError.message });
    }

    // Fetch event details for each match
    const matchDataWithEventDetails = await Promise.all(
      matchdata.map(async (match) => {
        const { data: event, error: eventError } = await supabase
          .from("events")
          .select("*")
          .eq("id", match.eventid)
          .single();

        if (eventError) {
          console.error("Error fetching event details:", eventError.message);
          return { ...match, eventName: null, eventDate: null, eventLocation: null, ageDivision: null };
        }

        return {
          ...match,
          eventName: event.name,
          eventDate: event.date,
          eventLocation: event.location,
          ageDivision: event.agedivision,
        };
      })
    );

    console.log("Fetched athlete data:", athlete); // Log athlete data to the console
    console.log("Fetched match data:", matchdata); // Log match data to the console
    console.log("Fetched recent match data:", recentmatch); // Log recent match data to the console

    // Render the athletes-profile.hbs template with the fetched data
    res.render("athletes-profile", {
      athlete,
      matchdata,
      recentmatch,
      matchDataWithEventDetails,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/notifications", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const userid = req.session.user.id; // Get the current user's username from the session

  try {
    const { data: clubInvitations, error: clubInvitationsError } = await supabase
      .from("club_invitations")
      .select("*")
      .eq("invited_user", userid)
      .is("status", null);

    if (clubInvitationsError) {
      return res.status(400).json({ error: clubInvitationsError.message });
    }

    const { data: notifications, error: notificationsError } = await supabase
      .from("notifications")
      .select("*")
      .eq("userid", userid);

    if (notificationsError) {
      return res.status(400).json({ error: notificationsError.message });
    }

    console.log("Fetched club invitations data:", clubInvitations); // Log the club invitations data to the console
    console.log("Fetched notifications data:", notifications); // Log the notifications data to the console

    // Render the notifications.hbs template with the fetched data
    res.render("notifications", {
      club_invitations: clubInvitations,
      notifications: notifications,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/help-center", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase.from("athletes").select("*");

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the athletes.hbs template with the fetched data
    res.render("help-center", { athletes: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/kyorugi-scoresheet/:matchid", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const { matchid } = req.params;

  try {
    // Fetch match details
    const { data: match, error: matchError } = await supabase
      .from("kyorugi_matches")
      .select("*")
      .eq("id", matchid)
      .single();

    if (matchError) {
      return res.status(400).json({ error: matchError.message });
    }

    // Fetch player1 details
    const { data: player1, error: player1Error } = await supabase
      .from("athletes")
      .select("name")
      .eq("userid", match.player1)
      .single();

    if (player1Error) {
      return res.status(400).json({ error: player1Error.message });
    }

    // Fetch player2 details
    const { data: player2, error: player2Error } = await supabase
      .from("athletes")
      .select("name")
      .eq("userid", match.player2)
      .single();

    if (player2Error) {
      return res.status(400).json({ error: player2Error.message });
    }

    console.log("Fetched match data:", match); // Log match data to the console
    console.log("Fetched player1 data:", player1); // Log player1 data to the console
    console.log("Fetched player2 data:", player2); // Log player2 data to the console

    // Render the scoresheet template with the fetched data
    res.render("kyorugi-scoresheet", {
      match,
      player1_name: player1.name,
      player2_name: player2.name,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/poomsae-scoresheet/:id", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const { id } = req.params; // Get the group and athlete ID from the URL

  try {
    // Fetch the poomsae group details from the poomsae_players table
    const { data: players, error: playersError } = await supabase
      .from("poomsae_players")
      .select("*")
      .eq("id", id)
      .single(); // Ensure we get a single record

    if (playersError) {
      return res.status(400).json({ error: playersError.message });
    }

    // Fetch athlete details
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("*")
      .eq("id", players.athleteid)
      .single();

    if (athleteError) {
      return res.status(400).json({ error: athleteError.message });
    }

    console.log("Fetched players data:", players); // Log the players data to the console
    console.log("Fetched athlete data:", athlete); // Log the athlete data to the console

    // Render the poomsae-scoresheet.hbs template with the fetched data
    res.render("poomsae-scoresheet", {
      user: req.session.user,
      players,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//MEMBERSHIP PAGES

app.get("/membership-ncc", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase.from("clubs").select("*");

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the athletes.hbs template with the fetched data
    res.render("membership-ncc", { clubs: data, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/membership-instructor", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  try {
    const { data, error } = await supabase.from("clubs").select("*");

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    console.log("Fetched data:", data); // Log the data to the console

    // Render the athletes.hbs template with the fetched data
    res.render("membership-instructor", {
      clubs: data,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/membership-status", async function (req, res) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  const userid = req.session.user.id;
  const ptaverified = req.session.user.ptaverified;

  try {
    let nccData, clubData;
    let nccError, clubError;

    if (ptaverified) {
      // Fetch all rows if user is 'pta'
      ({ data: nccData, error: nccError } = await supabase
        .from("ncc_registrations")
        .select("*"));

      ({ data: clubData, error: clubError } = await supabase
        .from("club_registrations")
        .select("*"));

      ({ data: instData, error: clubError } = await supabase
        .from("instructor_registrations")
        .select("*"));
    } else {
      // Fetch only rows submitted by the current user
      ({ data: nccData, error: nccError } = await supabase
        .from("ncc_registrations")
        .select("*")
        .eq("submittedby", userid));

      ({ data: clubData, error: clubError } = await supabase
        .from("club_registrations")
        .select("*")
        .eq("submittedby", userid));

      ({ data: instData, error: clubError } = await supabase
        .from("instructor_registrations")
        .select("*")
        .eq("submittedby", userid));
    }

    if (nccError) {
      console.error("Error fetching NCC data:", nccError.message);
      return res.status(500).send("Error fetching NCC data");
    }

    if (clubError) {
      console.error("Error fetching club data:", clubError.message);
      return res.status(500).send("Error fetching club data");
    }

    res.render("membership-status", {
      ncc_registrations: nccData,
      club_registrations: clubData,
      instructor_registrations: instData,
      user: req.session.user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/membership-review/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase
      .from("ncc_registrations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching registration:", error.message);
      return res.status(500).send("Error fetching registration");
    }

    // Render the membership-review.hbs template with the fetched data
    res.render("membership-review", {
      registration: data,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).send("Server error");
  }
});

app.get("/instructor-review/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase
      .from("instructor_registrations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching registration:", error.message);
      return res.status(500).send("Error fetching registration");
    }

    // Render the membership-review.hbs template with the fetched data
    res.render("instructor-review", {
      registration: data,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).send("Server error");
  }
});

app.get("/clubreg-review/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase
      .from("club_registrations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching registration:", error.message);
      return res.status(500).send("Error fetching registration");
    }

    res.render("clubreg-review", {
      clubregistration: data,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).send("Server error");
  }
});

app.get("/membership-club", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the specific registration data
    const { data, error } = await supabase;

    if (error) {
      console.error("Error fetching registration:", error.message);
      return res.status(500).send("Error fetching registration");
    }

    // Render the membership-review.hbs template with the fetched data
    res.render("membership-club", {
      registration: data,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).send("Server error");
  }
});


app.get('/athletes', (req, res) => {
  Athlete.find({}, (err, athletes) => {
    if (err) {
      return res.status(500).send('Error retrieving athletes');
    }
    res.render('athletes', { athletes: athletes });
  });
});

app.get('/analytics', (req, res) => {
  res.render('analytics', { user: req.session.user });
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});



// Route to handle creating an announcement
app.post("/create-announcement", async (req, res) => {
  const { title, subject, body, clubid } = req.body;

  if (!req.session || !req.session.user) {
    return res.status(403).send("User not authenticated");
  }

  const originalposter = req.session.user.username;
  const profilepic = req.session.user.profilepic;

  if (!clubid) {
    return res.status(400).send("Club ID is missing");
  }

  try {
    // Log the data being inserted for debugging purposes
    console.log({
      title,
      subject,
      body,
      clubid: parseInt(clubid),
      originalposter,
      profilepic
    });

    // Insert the new announcement into 'club_announcements' table
    const { data, error } = await supabase
      .from("club_announcements")
      .insert([
        {
          title,
          subject,
          body,
          clubid: parseInt(clubid),
          originalposter,
          profilepic
        },
      ]);

    if (error) {
      console.error("Error creating announcement:", error.message);
      return res.status(500).send("Error creating announcement");
    }

    // Redirect back to the club details page after successful insertion
    res.redirect(`/clubs-details/${clubid}`);
  } catch (error) {
    console.error("Server error:", error.message);
    res.status(500).send("Server error while creating announcement");
  }
});

app.get('/events-data', async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from('events')
      .select('id, name, date, location, description');

    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json(events);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

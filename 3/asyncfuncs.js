const { createClient } = require("@supabase/supabase-js");
const moment = require("moment");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


// Define fetchNotifications middleware
async function fetchNotifications(req, res, next) {
  if (!req.session.user) {
    return next(); // If no user is logged in, skip fetching notifications
  }

  const userId = req.session.user.id;

  try {
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .eq('userid', userId)
      .order('created_at', { ascending: false });

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError.message);
      return next(); // Skip notifications if there's an error
    }

    res.locals.notifications = notifications; // Attach notifications to res.locals
    next();
  } catch (error) {
    console.error('Server error:', error.message);
    next(); // Skip notifications if there's a server error
  }
}

async function fetchUserData(req, res, next) {
  if (!req.session.user) {
    return next(); // If no user is logged in, skip fetching user data
  }

  const userId = req.session.user.id;

  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single(); // Ensure only one user is fetched

    if (userError) {
      console.error('Error fetching user data:', userError.message);
      return next(); // Skip user data if there's an error
    }

    req.session.user = userData; // Store user data into req.session.user
    res.locals.userData = userData; // Attach user data to res.locals
    next();
  } catch (error) {
    console.error('Server error:', error.message);
    next(); // Skip user data if there's a server error
  }
}

async function checkAndExpireNCCRegistrations(req, res, next) {
  const currentDate = new Date();
  const currentDateString = currentDate.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  try {
    const { data: registrations, error: registrationsError } = await supabase
      .from("ncc_registrations")
      .select("*");

    if (registrationsError) {
      throw new Error(`Error fetching NCC registrations: ${registrationsError.message}`);
    }

    const expiredRegistrations = registrations.filter(registration => {
      const expiresOn = new Date(registration.expireson);
      return expiresOn.toISOString().split('T')[0] === currentDateString;
    });

    if (expiredRegistrations.length > 0) {
      const ids = expiredRegistrations.map(registration => registration.id);
      const { error: updateError } = await supabase
        .from("ncc_registrations")
        .update({ status: 5 })
        .in("id", ids);

      if (updateError) {
        throw new Error(`Error updating NCC registration status: ${updateError.message}`);
      }

      console.log(`Updated status to 5 for ${expiredRegistrations.length} registrations.`);
    } else {
    }
    
  } catch (error) {
    console.error(error.message);
  }

  next();
}

async function checkAndExpireInstructorRegistrations(req, res, next) {
  const currentDate = new Date();
  const currentDateString = currentDate.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  try {
    const { data: registrations, error: registrationsError } = await supabase
      .from("instructor_registrations")
      .select("*");

    if (registrationsError) {
      throw new Error(`Error fetching instructor registrations: ${registrationsError.message}`);
    }

    const expiredRegistrations = registrations.filter(registration => {
      const expiresOn = new Date(registration.expireson);
      return expiresOn.toISOString().split('T')[0] === currentDateString;
    });

    if (expiredRegistrations.length > 0) {
      const ids = expiredRegistrations.map(registration => registration.id);
      const { error: updateError } = await supabase
        .from("instructor_registrations")
        .update({ status: 5 })
        .in("id", ids);

      if (updateError) {
        throw new Error(`Error updating instructor registration status: ${updateError.message}`);
      }

      console.log(`Updated status to 5 for ${expiredRegistrations.length} instructor registrations.`);
    }
    
  } catch (error) {
    console.error(error.message);
  }

  next();
}

async function checkUpcomingEvents(req, res, next) {
  const currentDate = moment().format('YYYY-MM-DD');
  const currentTime = moment().format('HH:mm:ss');
  const fiveMinutesFromNow = moment().add(5, 'minutes');

  try {
    // Step 2: Query the events table to find events happening in 5 minutes
    const { data: upcomingEvents, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('date', currentDate)
      .gte('starttime', currentTime)
      .lte('starttime', fiveMinutesFromNow.format('HH:mm:ss'));

    if (eventsError) {
      throw new Error(eventsError.message);
    }

    if (upcomingEvents.length === 0) {
      console.log('No events happening in the next 5 minutes.');
      return;
    }

    // Step 3: Query the events_registrations table to find users registered for those events
    const eventIds = upcomingEvents.map(event => event.id);
    const { data: registeredUsers, error: registrationsError } = await supabase
      .from('events_registrations')
      .select('*')
      .in('eventid', eventIds)
      .eq('registered', true);

    if (registrationsError) {
      throw new Error(registrationsError.message);
    }

    if (registeredUsers.length === 0) {
      console.log('No users registered for upcoming events.');
      return;
    }

    // Step 4: Send notifications to those users
    const notificationPromises = registeredUsers.map(async user => {
      const message = `Reminder: Your event is starting in 5 minutes!`;

      // Check if a notification already exists
      const { data: existingNotifications, error: checkError } = await supabase
      .from('notifications')
      .select('*')
      .eq('userid', user.userid)
      .eq('message', message)
      .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows found
      throw new Error(`Error checking existing notifications: ${checkError.message}`);
      }

      if (!existingNotifications) {
      return supabase
        .from('notifications')
        .insert([
        {
          userid: user.userid,
          message: message,
          type: 'Event'
        }
        ]);
      } else {
      return { error: null }; // No need to insert, return a resolved promise
      }
    });

    const notificationResults = await Promise.all(notificationPromises);

    notificationResults.forEach((result, index) => {
      if (result.error) {
        console.error(`Error sending notification to user ${registeredUsers[index].userid}:`, result.error.message);
      }
    });

    console.log('Notifications sent successfully.');
  } catch (error) {
    console.error('Error checking upcoming events:', error.message);
  }

  next();
}


module.exports = {

  fetchNotifications,

  fetchUserData,

  checkAndExpireNCCRegistrations,

  checkAndExpireInstructorRegistrations,

  checkUpcomingEvents

};
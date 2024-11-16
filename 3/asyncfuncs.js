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

      // Notify users about expired registrations
      const notifications = expiredRegistrations.map(registration => ({
        userid: registration.submittedby,
        message: `Your NCC registration has expired.`,
        desc: 'Please renew your registration to continue being a member of the PTA.',
        type: "Registration"
      }));

      // Fetch existing notifications first
      const { data: existingNotifications, error: fetchError } = await supabase
        .from("notifications")
        .select("*")
        .in("userid", notifications.map(notification => notification.userid));

      if (fetchError) {
        throw new Error(`Error fetching existing notifications: ${fetchError.message}`);
      }

      for (const notification of notifications) {
        const existingNotification = existingNotifications.find(n => 
          n.userid === notification.userid && n.message === notification.message);

        if (!existingNotification) {
          const { error: notificationError } = await supabase
            .from("notifications")
            .insert(notification);

          if (notificationError) {
            throw new Error(`Error inserting notifications: ${notificationError.message}`);
          }
        }
      }

      console.log(`Notified users with expired registrations.`);

      // Update athleteverified column to false for users with expired registrations
      const userIds = expiredRegistrations.map(registration => registration.submittedby);
      const { error: updateUserError } = await supabase
        .from("users")
        .update({ athleteverified: false })
        .in("id", userIds);

      if (updateUserError) {
        throw new Error(`Error updating user athleteverified status: ${updateUserError.message}`);
      }

      console.log(`Updated athleteverified to false for users with expired registrations.`);
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

      // Notify users about expired registrations
      const notifications = expiredRegistrations.map(registration => ({
        userid: registration.submittedby,
        message: `Your instructor registration has expired.`,
        desc: 'Please renew your registration to continue being an instructor.',
        type: "Registration"
      }));

      // Fetch existing notifications first
      const { data: existingNotifications, error: fetchError } = await supabase
        .from("notifications")
        .select("*")
        .in("userid", notifications.map(notification => notification.userid));

      if (fetchError) {
        throw new Error(`Error fetching existing notifications: ${fetchError.message}`);
      }

      for (const notification of notifications) {
        const existingNotification = existingNotifications.find(n => 
          n.userid === notification.userid && n.message === notification.message);

        if (!existingNotification) {
          const { error: notificationError } = await supabase
            .from("notifications")
            .insert(notification);

          if (notificationError) {
            throw new Error(`Error inserting notifications: ${notificationError.message}`);
          }
        }
      }

      console.log(`Notified users with expired instructor registrations.`);
    }
  } catch (error) {
    console.error(error.message);
  }

  next();
}

async function checkUpcomingEvents(req, res, next) {
  const currentDate = new Date();
  const oneHourLater = new Date(currentDate.getTime() + 60 * 60000); // Current time + 1 hour
  const twentyFourHoursLater = new Date(currentDate.getTime() + 24 * 60 * 60000); // Current time + 24 hours

  try {
    const { data: eventsInOneHour, error: eventsErrorOneHour } = await supabase
      .from("events")
      .select("*")
      .gte("starttime", moment(currentDate).format("YYYY-MM-DD HH:mm:ss"))
      .lte("starttime", moment(oneHourLater).format("YYYY-MM-DD HH:mm:ss"));

    if (eventsErrorOneHour) {
      throw new Error(`Error fetching events in one hour: ${eventsErrorOneHour.message}`);
    }

    const { data: eventsInTwentyFourHours, error: eventsErrorTwentyFourHours } = await supabase
      .from("events")
      .select("*")
      .gte("starttime", moment(currentDate).format("YYYY-MM-DD HH:mm:ss"))
      .lte("starttime", moment(twentyFourHoursLater).format("YYYY-MM-DD HH:mm:ss"));

    if (eventsErrorTwentyFourHours) {
      throw new Error(`Error fetching events in twenty-four hours: ${eventsErrorTwentyFourHours.message}`);
    }

    const events = [...eventsInOneHour, ...eventsInTwentyFourHours];
    if (events.length > 0) {
      const eventIds = events.map(event => event.id);

      const { data: eventRegistrations, error: eventRegistrationsError } = await supabase
        .from("events_registrations")
        .select("*")
        .in("eventid", eventIds);

      if (eventRegistrationsError) {
        throw new Error(`Error fetching event registrations: ${eventRegistrationsError.message}`);
      }

      const userIds = eventRegistrations.map(registration => registration.userid);

      // Create notifications for users
      const notifications = [];

      events.forEach(event => {
        userIds.forEach(userId => {
          const timeDiff = new Date(event.starttime) - currentDate;
          const message = timeDiff <= 60 * 60000
            ? `${event.name} is starting in 1 hour!`
            : `${event.name} is starting in 24 hours!`;

          notifications.push({
            userid: userId,
            message: message,
            type: "Event"
          });
        });
      });

      for (const notification of notifications) {
        const { data: existingNotification, error: existingNotificationError } = await supabase
          .from("notifications")
          .select("*")
          .eq("userid", notification.userid)
          .eq("message", notification.message)
          .single();

        if (existingNotificationError && existingNotificationError.code !== 'PGRST116') {
          throw new Error(`Error checking existing notifications: ${existingNotificationError.message}`);
        }

        if (!existingNotification) {
          const { error: notificationError } = await supabase
            .from("notifications")
            .insert(notification);

          if (notificationError) {
            throw new Error(`Error inserting notifications: ${notificationError.message}`);
          }
        }
      }

      console.log(`Notified users with IDs: ${userIds.join(", ")}`);
    }
  } catch (error) {
    console.error(error.message);
  }

  next();
}



module.exports = {

  fetchNotifications,

  fetchUserData,

  checkAndExpireNCCRegistrations,

  checkAndExpireInstructorRegistrations,

  checkUpcomingEvents,
};
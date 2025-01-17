const { isEmpty } = require('lodash');
const { v4 } = require('uuid');
const db = require('../../connectors/db');
const roles = require('../../constants/roles');

module.exports = function(app) {
  // Register HTTP endpoint to create new user
  app.post('/api/v1/users', async function(req, res) {
    // Check if user already exists in the system
    const userExists = await db.select('*')
      .from('se_project.users')
      .where('email', req.body.email);
    if (!isEmpty(userExists)) {
      return res.status(400).send('user exists');
    }
    
    const newUser = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      password: req.body.password,
      facultyId: req.body.facultyId,
      roleId: roles.student,
    };
    try {
      const user = await db('se_project.users')
        .insert(newUser)
        .returning('*');
      const courses = await db.select('*')
        .from('se_project.courses')
        .where('facultyId', req.body.facultyId);
      for(let course of courses)
      {
        const newEnroll = {
          userId: user[0].id,
          courseId: course.id,
          active : true,
        };
        const enroll = await db('se_project.enrollments')
          .insert(newEnroll)
          .returning('*');
      }
      return res.status(200).json(user);
    } catch (e) {
      console.log(e.message);
      return res.status(400).send('Could not register user');
    }
  });

  // Register HTTP endpoint to create new user
  app.post('/api/v1/users/login', async function(req, res) {
    // get users credentials from the JSON body
    const { email, password } = req.body
    if (!email) {
      // If the email is not present, return an HTTP unauthorized code
      return res.status(400).send('email is required');
    }
    if (!password) {
      // If the password is not present, return an HTTP unauthorized code
      return res.status(400).send('Password is required');
    }

    // validate the provided password against the password in the database
    // if invalid, send an unauthorized code
    const user = await db.select('*').from('se_project.users').where('email', email).first();
    if (isEmpty(user)) {
      return res.status(400).send('user does not exist');
    }

    if (user.password !== password) {
      return res.status(401).send('Password does not match');
    }

    // set the expiry time as 15 minutes after the current time
    const token = v4();
    const currentDateTime = new Date();
    const expiresAt = new Date(+currentDateTime + 1000 * 60 * 5); // expire in 5 minutes

    // create a session containing information about the user and expiry time
    const session = {
      userId: user.id,
      token,
      expiresAt,
    };
    try {
      await db('se_project.sessions').insert(session);
      // In the response, set a cookie on the client with the name "session_cookie"
      // and the value as the UUID we generated. We also set the expiration time.
      return res.cookie("session_token", token, { expires: expiresAt }).status(200).send('login successful');
    } catch (e) {
      console.log(e.message);
      return res.status(400).send('Could not register user');
    }
  });
};

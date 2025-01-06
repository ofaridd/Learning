const { values } = require('lodash');
const { v4 } = require('uuid');
const db = require('../../connectors/db');
const roles = require('../../constants/roles');
const { getSessionToken } = require('../../utils/session');
// const getUser = require('./views');
const getUser = async function(req) {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(301).redirect('/');
  }

  const user = await db.select('*')
    .from('se_project.sessions')
    .where('token', sessionToken)
    .innerJoin('se_project.users', 'se_project.sessions.userId', 'se_project.users.id')
    .innerJoin('se_project.roles', 'se_project.users.roleId', 'se_project.roles.id')
    .innerJoin('se_project.faculties', 'se_project.users.facultyId', 'se_project.faculties.id')
    .first();
  
  user.isStudent = user.roleId === roles.student;
  user.isAdmin = user.roleId === roles.admin;

  return user;  
};

module.exports = function(app) {
  // For student to drop course
  app.put('/api/v1/courses/:courseId/drop', async function(req, res){
    try{
      // const drop = await db('se_project.courses')
      // .innerJoin('se_project.enrollments', 'se_project.courses.id', 'se_project.enrollments.courseId')
      // .where('se_project.enrollments.courseId', req.params.courseId)
      // .update({active: false});
      const user = await getUser(req);
      const drop = await db('se_project.enrollments')
        .where('se_project.enrollments.courseId', req.params.courseId)
        .andWhere('se_project.enrollments.userId', user.userId)
        .update({active : false});
      return res.status(200).send("Course " + req.params.courseId + " has been dropped");
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to drop course " + req.params.courseId);
    }
  }); 
  // For student to make a request to transfer to another faculty
  app.post('/api/v1/faculties/transfer', async function(req, res){
    const newFacultyId = Number(req.body.facultyId);
    try{
      const user = await getUser(req);
      const newRequest = {
        userId: user.userId,
        currentFacultyId: user.facultyId,
        newFacultyId,
        status: "pending",
      };
      const request = await db('se_project.transfer_requests')
        .insert(newRequest)
        .returning('*');
      return res.status(200).send("Transfer request sent");
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Could not send transfer request");
    }
  });
  // For admin to accept or reject transfer requests
  app.post('/api/v1/transfers/:transferId', async function(req, res){
    try{
      // Change status to approved / rejected
      const changeStatus = await db('se_project.transfer_requests')
        .where('id', req.params.transferId)
        .update({status: req.body.transferStatus})
        .returning('*');

      if(req.body.transferStatus == "approved")
      {
        // Change faculty id of student
        const transferInfo = changeStatus[0];
        const changeFaculty = await db('se_project.users')
        .where('id', transferInfo.userId)
        .update({facultyId: transferInfo.newFacultyId});

        // Drop all courses in old faculty 
        const dropCourses = await db('se_project.enrollments')
        .where('userId', transferInfo.userId)
        .update({active: false});

        // Enroll student in new Faculty
        const courses = await db.select('*')
          .from('se_project.courses')
          .where('facultyId', transferInfo.newFacultyId);
        for(let course of courses)
        {
          const newEnroll = {
            userId: transferInfo.userId,
            courseId: course.id,
            active : true,
          };
          const enroll = await db('se_project.enrollments')
            .insert(newEnroll)
            .returning('*');
        }
        return res.status(200).send("Student has succesfully transfered");
      }
      else if(req.body.transferStatus == "rejected")
      {
        return res.status(200).send("Transfer request has been succesfully denied");
      }
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to update transfer request");
    }
  });
  // For admin to get all the enrollment data
  app.get('/api/v1/enrollment/:courseId', async function(req, res){
    try{
      console.log(req.body);
      const enrollments = await db.select('enrollments.userId', 'users.firstName', 'users.lastName', 'enrollments.grade')
        .from('se_project.enrollments')
        .innerJoin('se_project.users', 'se_project.enrollments.userId', 'se_project.users.id')
        .where('enrollments.courseId', req.params.courseId)
        .andWhere('enrollments.active', true);
      return res.status(200).json(enrollments);
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to load enrollments table");
    }
  });
  // For admin to update all the student grades
  app.put('/api/v1/enrollment/:courseId', async function(req, res){
    try{
      // const body = req.body.values[0];
      // const grades = body.grade;
      // const ids = req.body.userId;
      // console.log(ids);
      // console.log(grades);
      const values = req.body.values;
      for(let i = 0; i < values.length; i++)
      {
        if(!values[i].grade)
        {
          continue;
        }
        let grade = values[i].grade;
        const id = values[i].userId;
        const newGrade = await db('se_project.enrollments')
          .where('courseId', req.params.courseId)
          .andWhere('userId', id)
          .update({grade});
      }
      return res.status(200).send("Student grades updated");
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to update grades");
    }
  });
  // For admin to get all courses by faculty id
  app.get('/api/v1/faculties/:facultyId', async function(req, res){
    try{
      const courses = await db.select('code', 'course', 'creditHours', 'id')
        .from('se_project.courses')
        .where('se_project.courses.facultyId', req.params.facultyId);
      return res.status(200).json(courses);
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to get courses in this faculty");
    }
  });
  // For admin to update all the student grades
  app.put('/api/v1/courses/:courseId', async function(req, res){
    const currentCourse = await db.select('*')
      .from('se_project.courses')
      .where('id', req.params.courseId);
      code = req.body.code;
      course = req.body.course;
      creditHours = req.body.creditHours;
    if(!course){
      course = currentCourse.course;
    }
    if(!code){
      code = currentCourse.code;
    }
    if(!creditHours){
      creditHours = currentCourse.creditHours;
    }
    const newCourse = {
      course,
      code,
      creditHours
    }
    try{
      const courses = await db('se_project.courses')
        .where('id', req.params.courseId)
        .update(newCourse);
      return res.status(200).send("Course updated succesfully");
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to update course");
    }
  });
  app.delete('/api/v1/courses/:courseId', async function(req, res){
    try{
      const courses = await db('se_project.courses')
        .where('id', req.params.courseId)
        .del();
      return res.status(200).send("Course deleted succesfully");
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to delete course");
    }
  });
  // Register HTTP endpoint to render /logout page
  app.put('/api/v1/logout', async function(req, res) {
    try{
      const date = new Date();
      const expire = await db('se_project.sessions')
        .where('token', getSessionToken(req))
        .update({expiresAt: date});
      return res.status(200).send("Succesfully loged out");
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Failed to Logout");
    }
  });
};

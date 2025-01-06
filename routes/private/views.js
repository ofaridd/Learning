const db = require('../../connectors/db');
const roles = require('../../constants/roles');
const { getSessionToken } = require('../../utils/session');

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
  
  console.log('user =>', user)
  user.isStudent = user.roleId === roles.student;
  user.isAdmin = user.roleId === roles.admin;

  return user;  
};
module.exports = getUser;

module.exports = function(app) {

  // Register HTTP endpoint to render /dashboard page
  app.get('/dashboard', async function(req, res) {
    const user = await getUser(req);
    return res.render('dashboard', user);
  });

  // Register HTTP endpoint to render /courses page
  app.get('/courses', async function(req, res) {
    const user = await getUser(req); // object
    const courses = await db.select('*') // array of objects
      .from('se_project.courses')
      .innerJoin('se_project.enrollments', 'se_project.courses.id', 'se_project.enrollments.courseId')
      .where('userId', user.userId)
      .andWhere('active', true);
    const roleId = user.roleId;
    const courseCount = courses.length;
    return res.render('courses', {roleId, courses, courseCount});
  });

  // Register HTTP endpoint to render /transfer page 
  app.get('/transfer', async function(req, res) {
    const user = await getUser(req);

    const faculties = await db.select('*')
      .from('se_project.faculties')
      .whereNot('id', user.facultyId);

    const transfer_requests = await db.select('tr.id', 'currentFaculty.faculty as currentfaculty', 'newFaculty.faculty as newfaculty', 'tr.status as status')
      .from('se_project.transfer_requests as tr')
      .innerJoin('se_project.faculties as newFaculty', 'tr.newFacultyId', 'newFaculty.id')
      .innerJoin('se_project.faculties as currentFaculty', 'tr.currentFacultyId', 'currentFaculty.id')
      .where('userId', user.userId);
    const size = transfer_requests.length;
    const viewTable = size != 0;
    let viewList = true;
    if(size)
    {
      viewList = transfer_requests[size - 1].status != "pending";
    }
    const roleId = user.roleId;
    return res.render('transfer', {viewTable,viewList, transfer_requests, faculties, roleId});
  });

  // Register HTTP endpoint to render /transcripts page
  app.get('/transcripts', async function(req, res) {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(301).redirect('/');
    }
    const user = await getUser(req);
    const courses = await db.select('courses.id', 'courses.code', 'courses.course','courses.creditHours','enrollments.grade')
      .from('se_project.courses')
      .innerJoin('se_project.enrollments', 'se_project.courses.id', 'se_project.enrollments.courseId')
      .where('userId', user.userId)
      .andWhere('active', true);

    // To calculate GPA
    let value = 0;
    let totalGrade = 0
    let totalCredit = 0;
    let nullCount = 0;
    for(let i = 0; i < courses.length; i++)
    {
      grade = courses[i].grade;
      if(grade === null)
      {
        courses[i].grade = -1;
        nullCount++;
      }
      else
      {
        grade > 94 ? value = 0.7 :
        grade > 86 ? value = 1.7 :
        grade > 74 ? value = 2.7 :
        grade > 60 ? value = 3.7 :
        value = 5;
        totalCredit += courses[i].creditHours;
        totalGrade += value * courses[i].creditHours;
      }
    }
    let courseCount = courses.length;
    let viewGrades = 1;
    let gpa;
    if(nullCount == courses.length)
    {
      gpa = -1;
      viewGrades = 0;
    }
    else
    {
      gpa = totalGrade / totalCredit;
    }

    gpa = gpa.toFixed(2);
    const roleId = user.roleId;
    return res.render('transcripts', {roleId,courses, gpa, courseCount, viewGrades});
  });

  // Register HTTP endpoint to render /mGrades page
  app.get('/manage/grades', async function(req, res) {
    const user = await getUser(req);
    const courses = await db.select('courses.code','courses.id')
      .from('se_project.courses')
    const roleId = user.roleId;
    return res.render('mGrades', {roleId, courses});
  });

  // Register HTTP endpoint to render /mCourses page
  app.get('/manage/courses', async function(req, res) {
    const user = await getUser(req);
    const faculties = await db.select('*')
      .from('se_project.faculties');
    const roleId = user.roleId;
    return res.render('mCourses', {roleId,faculties});
  });
  
  // Register HTTP endpoint to render /mCoursesEdit page
  app.get('/manage/courses/edit/:courseId', async function(req, res) {
    const user = await getUser(req);
    const courseId = req.params.courseId;
    const courses = await db.select('id', 'code','course','creditHours')
      .from('se_project.courses')
      .where('id', courseId);
    const course = courses[0];
    const roleId = user.roleId;
    return res.render('mCoursesEdit', {roleId, course});
  });

  // Register HTTP endpoint to render /mTransfers page
  app.get('/manage/transfers', async function(req, res) {
    const user = await getUser(req);
    const requests = await db.select('users.id as sid', 'users.firstName', 'users.lastName', 'tr.id as transferId', 'currentFaculty.faculty as currentfaculty', 'newFaculty.faculty as newfaculty')
      .from('se_project.transfer_requests as tr')
      .innerJoin('se_project.faculties as newFaculty', 'tr.newFacultyId', 'newFaculty.id')
      .innerJoin('se_project.faculties as currentFaculty', 'tr.currentFacultyId', 'currentFaculty.id')
      .innerJoin('se_project.users', 'tr.userId', 'users.id')
      .where('status', "pending");
      const roleId = user.roleId;
      console.log(requests);
      const viewTable = requests.length;
    return res.render('mTransfers', {roleId, requests, viewTable});
  });

  app.get('/logout', async function(req, res) {
    return res.render('logout');
  });

};

'use strict';

const mysql   = require('mysql2/promise');
const moment  = require('moment');
const numbers = require('numbers');
const octokit = require('@octokit/rest')();

export const run = async (event, context, callback) => {
  const category = process.env.PROPERTY_CATEGORY;

  const connection = await mysql.createConnection({
    host:           process.env.DB_HOST,
    user:           process.env.DB_USERNAME,
    password:       process.env.DB_PASSWORD,
    database:       process.env.DB_DATABASE,
    connectTimeout: 1000,
  });

  const start = moment.utc().subtract(1, 'day').startOf('day').toISOString();
  const end = moment.utc().subtract(1, 'day').endOf('day').toISOString();

  const [data, fields] = await connection.query({
    sql: `
      SELECT price
      FROM properties
      WHERE created_at BETWEEN ? AND ?
      AND price > 0
      AND type = ?
    `,

    values: [start, end, category],

    typeCast(field, next) {
      if (field.type === 'NEWDECIMAL') {
        return parseFloat(field.string());
      }

      return next();
    },
  });

  const prices = data.map(({ price }) => price);

  const stats = {
    date:         start,
    count:        prices.length,
    min:          parseInt(numbers.basic.min(prices), 10),
    max:          parseInt(numbers.basic.max(prices), 10),
    mean:         parseInt(numbers.statistic.mean(prices), 10),
    median:       parseInt(numbers.statistic.median(prices), 10),
    mode:         parseInt(numbers.statistic.mode(prices), 10),
    standardDev:  parseInt(numbers.statistic.standardDev(prices), 10),
  };

  connection.end();

  // await uploadToGithub(category, stats);

  callback(null, stats);
};

const uploadToGithub = async (category, data) => {
  await octokit.authenticate({
    type: 'token',
    token: process.env.GITHUB_TOKEN,
  });

  const { data: currentFile } = await octokit.repos.getContent({
    owner: 'brokalys',
    repo: 'data',
    path: `data/daily-${category}.csv`,
  });

  let content = new Buffer(currentFile.content, 'base64').toString();
  content += `"${data.date.substr(0, 10)}","${data.count}","${data.min}","${data.max}","${data.mean}","${data.median}","${data.mode}","${data.standardDev}"\n`;

  await octokit.repos.updateFile({
    owner: 'brokalys',
    repo: 'data',
    path: currentFile.path,
    message: `Daily data: ${data.date}`,
    content: new Buffer(content).toString('base64'),
    sha: currentFile.sha,
  });
};

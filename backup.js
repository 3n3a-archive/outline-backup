import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream';
import {promisify} from 'node:util'
import fetch from 'node-fetch';

const baseUrl = process.env.OUTLINE_URL
const apiToken = process.env.OUTLINE_API_KEY
const userAgent = process.env.BACKUP_UA || 'BackupScript/1.0'

const streamPipeline = promisify(pipeline);

async function makeReq(endpoint, body="") {
  let options = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
      'User-Agent': userAgent
    },
  }
  if (body != "") {
    options.body = JSON.stringify(body)
  }
  const res = await fetch(`${baseUrl}/api/${endpoint}`, options)
  if (res.ok) {
    const bodyRes = await res.json()
    const document = bodyRes.data
    return document
  } else {
    console.error(endpoint, body, res, await res.text())
    process.exit(1)
  }
}

async function startBackup() {
  let res = await makeReq('collections.export_all')
  console.log(res)
  if (res == undefined) {
    process.exit(1)
  }
  return res.fileOperation.id
}

async function trackBackupStatus(id) {
  let isComplete = false
  while (!isComplete) {
    let res = await makeReq('fileOperations.info', {id: id})
    isComplete = res.state == 'complete' ? true : false
    console.log(`Status: ${res.state}`)
  }
  return
}

async function getBackup(id) {
  const res = await fetch(`${baseUrl}/api/fileOperations.redirect`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
      'User-Agent': userAgent
    },
    body: JSON.stringify({id: id})
  })
  if (!res.ok) throw new Error(`unexpected response ${res.statusText}`);
  await streamPipeline(res.body, createWriteStream('./backup.zip'))
}

function checkAllConfigsExist() {
  if (baseUrl =="" ||
     apiToken == "") {
       console.error("Not all config values exist")
       process.exit(1)
    }
}

async function main() {
  checkAllConfigsExist()

  // Request export to be done
  let fileOperationId = await startBackup()

  // Track FileOperation, until completed
  await trackBackupStatus(fileOperationId)

  // Download Backup
  await getBackup(fileOperationId)
}

main()

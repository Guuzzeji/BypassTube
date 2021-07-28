const express = require('express');
const ytdl = require('ytdl-core');
const loki = require('lokijs');

const fs = require('fs');
const path = require('path');

const config = require('./config.json');

let port = process.env.PORT || config.PORT;
let db_remove_time = config.db_remove_time;

const db = new loki('man.db');
let videosDB = db.addCollection('videos');

const app = express();
app.set('view engine', 'ejs');

//! Create tmp file
if (!fs.existsSync('./tmp')) {
    fs.mkdirSync('./tmp');
} else {
    //! Use for local run server
    //* Clean Db folder on Start
    let video_folder = fs.readdirSync('./tmp');
    if (video_folder != []) {
        for (let x = 0; x < video_folder.length; x++) {
            if (video_folder[x].endsWith('.mp4')) {
                fs.unlinkSync(path.join(__dirname, '/tmp/', video_folder[x]));
            }
        }
    }
}

//* Cleans DD after a set amount of time
setInterval(function () {
    console.log(videosDB.data);

    if (videosDB.data != []) {
        for (let x = 0; x < videosDB.data.length; x++) {
            console.log('remove', videosDB.data[x]);
            fs.unlinkSync(videosDB.data[x].path);
            videosDB.remove(videosDB.data[x]);
        }
    }

}, db_remove_time);


//* Html
app.use(express.static('./static'));

app.get('/videopage/:vid_id', async function (req, res) {

    let db_finder = videosDB.find({ "id": req.params.vid_id })[0];

    //console.log(req.params.vid_id);

    if (db_finder != undefined) {

        let url = ytdl.getVideoID(req.params.vid_id);
        let info = await ytdl.getInfo(url);

        //console.log(info);

        res.render('video', {
            source: '/api/vid/' + db_finder.id,
            views: info.videoDetails.viewCount,
            likes: info.videoDetails.likes,
            dislikes: info.videoDetails.dislikes,
            user: info.videoDetails.author.name,
            url_user: info.videoDetails.author.channel_url,
            about: info.videoDetails.description,
            date: info.videoDetails.uploadDate,
            title: info.videoDetails.title,
            video_url: info.videoDetails.video_url
        });

    } else {
        res.send('Video Not Found on Server');
    }

});

//* Api
//! Download Video  
app.post('/api/dl/:vid_id', async function (req, res) {
    let db_finder = videosDB.find({ "id": req.params.vid_id })[0];

    console.log('db', db_finder);

    if (db_finder == undefined) {
        if (ytdl.validateID(req.params.vid_id) == true) {
            let url = ytdl.getVideoID(req.params.vid_id);
            //console.log(url);
            let video = ytdl(url);

            video.pipe(fs.createWriteStream('tmp/' + req.params.vid_id + '.mp4'));

            video.on('data', function (chunk) {
                console.log('Chunk', url, chunk.length);
            });

            video.on('end', async function () {

                let vid_url = "/api/vid/" + req.params.vid_id;
                let webpage_url = "videopage/" + req.params.vid_id;

                let db_vid = {
                    id: req.params.vid_id,
                    path: path.join(__dirname, '/tmp/' + req.params.vid_id + '.mp4'),
                    page: webpage_url,
                    vid: vid_url
                };

                videosDB.insert(db_vid);

                res.send({
                    url: webpage_url
                });

            });

        } else {
            res.send({
                error: 'oof'
            });
        }

    } else {
        res.send({
            url: db_finder.page
        });
    }
});

//! Video Sender
app.get('/api/vid/:vid_id', function (req, res) {
    let vid = videosDB.find({ "id": req.params.vid_id })[0];

    console.log('db', vid);

    if (vid != undefined) {
        const stat = fs.statSync(vid.path);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1]
                ? parseInt(parts[1], 10)
                : fileSize - 1;

            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(vid.path, { start, end });

            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);

        } else {

            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };

            res.writeHead(200, head);
            fs.createReadStream(vid.path).pipe(res);
        }
    }

});

app.listen(port, function () {
    console.log('server running on port:', port);
});
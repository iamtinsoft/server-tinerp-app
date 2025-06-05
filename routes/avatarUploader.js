const express = require("express");
const upload = require("../middleware/multer");
//const { ProcessEmployees } = require("../write");
//const ProcessEmployees = require("../write");
const router = express.Router();


router.post("/single", upload.single("myFile"), async (req, res) => {
    const file = req.file;
    console.log(file);
    if (!file) {
        res.status(500).send("File could not be Uploaded");
    } else {
        //ProcessEmployees(file.path);
        res.send(file);
    }
    res.send();
});



module.exports = router;

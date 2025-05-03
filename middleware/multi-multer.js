const multer = require("multer");
const config = require("config");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
cloudinary.config({
    cloud_name: config.get("cloudinary_cloud_name"),
    api_key: config.get("cloudinary_api_key"),
    api_secret: config.get("cloudinary_api_secret"),
});

// Configure Multer Storage for Cloudinary
// const storage = new CloudinaryStorage({
//   cloudinary: cloudinary,
//   params: {
//     folder: "uploads", // Cloudinary folder name
//     format: async (req, file) => "png", // Set file format
//     public_id: (req, file) => file.originalname.split(".")[0], // File name without extension
//   },
// });
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./uploads");
    },
    filename: function (req, file, cb) {
        cb(null, new Date().toISOString() + "-" + file.originalname);
    },
});
const fileFilter = (req, file, cb) => {
    if (
        file.mimetype === "image/jpeg" ||
        file.mimetype === "image/jpg" ||
        file.mimetype === "image/png" ||
        file.mimetype === "image/webp" ||
        file.mimetype === "video/mp4" ||
        file.mimetype === "application/vnd.ms-excel" ||
        file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
        cb(null, true);
    } else {
        cb({ message: file }, false);
    }
};
const multiupload = multer({
    storage: storage, limits: { fileSize: 1024 * 1024 * 100 * 10 },
    fileFilter: fileFilter,
});





// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 1024 * 1024 * 100 * 4 },
//   fileFilter: fileFilter,
// });
module.exports = multiupload;

import "dotenv/config";

import nodemailer from "nodemailer";

const { NODE_MAILER_USER, NODE_MAILER_PASSWORD } = process.env;

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use `true` for port 465, `false` for all other ports
  auth: {
    user: NODE_MAILER_USER,
    pass: NODE_MAILER_PASSWORD,
  },
});

// export const server = "http://13.234.27.11:5000/api/auth";
export const server = "https://api.nomadictownies.com/api/api/auth";

export const admin = "https://nomadic-admin.netlify.app";

export const sendVerificationMailAdmin = async (user) => {
  const verifyUrl = `${server}/verify-email-admin?token=${user?.verificationToken}`;
  const mailOptions = {
    from: "mudassarnetixsol@gmail.com",
    to: user?.email,
    subject: "Verify Your Email Address",
    text: "Please Click The Below Link To Verify Your Email Address",
    html: `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Document</title>
      </head>
    
      <style>
        * {
          box-sizing: border-box;
        }
    
        body {
          background-color: #f0f0f0;
          font-family: Verdana, Geneva, Tahoma, sans-serif;
          align-items: center;
          text-align: center;
          justify-content: center;
          padding: 0px;
          margin: 0px;
          box-sizing: border-box;
        }
    
        .container {
          background-color: white;
          /* padding: 30px; */
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          width: 1150px;
          margin: 50px auto;
          padding: 60px 60px;
        }
    
        // img {
        //   width: 170px;
        // }
    
        .username {
          font-weight: bold;
          text-align: center;
        }

        .btndiv{
          margin:0px auto;
        }
    
        .footer {

          padding: 50px 20px;
        }
      </style>
    
      <body>
        <div style="padding: 50px auto">
          <div class="container">
            <h1 style="text-align: center; margin: 0px auto">Email Verified</h1>
            <div class="" style="width: 130px; margin: 50px auto">
              <img
                src="https://ds9xi3hub5xxi.cloudfront.net/cdn/farfuture/otEn1mSO8Tk3mLVPFxYMCMwRn-qtie_ueonsviYMy0w/mtime:1608563955/sites/default/files/nodeicon/plugins_email-verification-plugin.png"
                alt=""
                style="width: 100%"
              />
              </div>
              <h2 style="text-align: center; margin: 0px auto">${user?.name}</h2>
      
              <p style="text-align: center">
                Thank you, your email has been Verified. Your account is now
                active.<br />Please use the link below to login to your account.
              </p>
              <div style="width:100%; margin:20px auto">
              <a
              href="${verifyUrl}"
                style="
                  text-align: center;
                  color: #000;
                  font-size: 16px;
                  /* border: none; */
                  height: 44px;
                  border-radius: 3px;
                  width: 300px;
                  margin: 0px auto;
                  border: 1px solid red;
                "
              >
        Confirm Email 
              </a>
            </div>
            
          </div>
        </div>
      </body>
    </html>
    
    `,
  };

  try {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error:", error);
      } else {
        console.log("Email sent:", info.response);
      }
    });
  } catch (error) {
    console.log("Eror in Eail sending ", error);
  }
};

export const sendResetMailAdmin = async (user) => {
  const verifyUrl = `${admin}/reset-password?token=${user?.verificationToken}`;

  const msg = {
    to: user?.email,
    from: { name: "Template", email: "danish79786@gmail.com" }, // Use the email address or domain you verified above
    subject: "Password Reset Request",
    text: "Please Click The Below Link To Verify Your Email Address",
    html: `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Document</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          .main {
            width: 100vw;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #000;
            font-family: sans-serif;
            color: #fff;
          }
    
          .container {
            max-width: 600px;
            width: 100%;
            padding: 0 30px;
          }
          button {
            padding: 15px 25px;
            background: linear-gradient(
              180deg,
              #d09b03 0%,
              #fef9c8 35.06%,
              #d38d00 74.31%,
              #fff8c4 116%
            );
            border-radius: 15px;
            font-size: 15px;
            color: "#292929";
            font-weight: 600;
          }
          h1 {
            text-align: center;
            background: linear-gradient(
              180deg,
              #d09b03 0%,
              #fef9c8 35.06%,
              #d38d00 74.31%,
              #fff8c4 116%
            );
            -webkit-text-fill-color: transparent;
            -webkit-background-clip: text;
          }
          .firstParagraph {
            margin-top: 150px;
            margin-bottom: 30px;
            font-size: 20px;
          }
          .secondParagraph {
            margin-top: 15px;
            font-size: 15px;
          }
        </style>
      </head>
      <body>
        <div class="main">
          <div class="container">
            <h1>Confirm Your Email</h1>
            <p class="firstParagraph">You are just one step away</p>
            <button> <a href='${verifyUrl}'> Confirm Email </a> </button>
            <p class="secondParagraph">
              If you received this email by mistake, simply delete it. You won't be
              subscribed if you don't click the confirmation link above.
            </p>
          </div>
        </div>
      </body>
    </html>`,
  };
};

export const sendSecondaryVerificationMailAdmin = async (
  user,
  secondaryEmail
) => {
  const verifyUrl = `${server}/verify-secondaryEmail?token=${user?.verificationToken?.token}&email=${secondaryEmail}`;

  const msg = {
    to: secondaryEmail,
    from: { name: "Template", email: "danish79786@gmail.com" }, // Use the email address or domain you verified above
    subject: "Verify Your Secondary Email Address",
    text: "Please Click The Below Link To Verify Your Secondary Email Address",
    html: `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Document</title>
      </head>
    
      <style>
        * {
          box-sizing: border-box;
        }
    
        body {
          background-color: #f0f0f0;
          font-family: Verdana, Geneva, Tahoma, sans-serif;
          align-items: center;
          text-align: center;
          justify-content: center;
          padding: 0px;
          margin: 0px;
          box-sizing: border-box;
        }
    
        .container {
          background-color: white;
          /* padding: 30px; */
          align-items: center;
          justify-content: center;
          text-align: center;
          width: 1150px;
          margin: 50px auto;
          padding: 60px 60px;
        }
    
        img {
          width: 170px;
        }
    
        .username {
          font-weight: bold;
          text-align: center;
        }
    
        .footer {
          background-color: #151515;
          padding: 50px 20px;
        }
      </style>
    
      <body>
        <div style="padding: 50px auto">
          <div class="container">
            <h1 style="text-align: center; margin: 0px auto">Email Verified</h1>
            <div class="" style="width: 130px; margin: 50px auto">
              <img
                src="https://ds9xi3hub5xxi.cloudfront.net/cdn/farfuture/otEn1mSO8Tk3mLVPFxYMCMwRn-qtie_ueonsviYMy0w/mtime:1608563955/sites/default/files/nodeicon/plugins_email-verification-plugin.png"
                alt=""
                style="width: 100%"
              />
            </div>
            <h2 style="text-align: center; margin: 0px auto">Hello John</h2>
    
            <p style="text-align: center">
              Thank you, your email has been Verified. Your account is now
              active.<br />Please use the link below to login to your account.
            </p>
    
            <button
              style="
                text-align: center;
                background-color: #00affe;
                color: white;
                font-size: 16px;
                /* border: none; */
                height: 44px;
                border-radius: 3px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1),
                  0 6px 6px rgba(0, 0, 0, 0.1);
                width: 300px;
                margin: 0px auto;
                border: 1px solid red;
              "
            >
              LOGIN TO YOUR ACCOUNT
            </button>
          </div>
    
          <div class="footer">
            <p style="text-align: center; color: #fff">
              Thank you for choosing Startup Email Templates.
            </p>
    
            <p style="text-align: center; margin: 15px auto; color: #fff">
              &copy; 2017 StartupEmails,Inc. All rights reserved.
            </p>
            <p style="text-align: center; color: #fff">
              &copy; 2017 StartupEmails,Inc. All rights reserved.
            </p>
    
            <p style="text-align: center; color: #fff">
              You recieved this email beacuse you signed up for StartupEmails
            </p>
          </div>
        </div>
      </body>
    </html>
    `,
  };

  await sgMail.send(msg);
};

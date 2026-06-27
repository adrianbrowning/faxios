import { styleText } from 'node:util';

export const printSuccessMessage = (message) => {
  console.log(styleText('green', 'Success:'), `${message}`);
};

export const printInfoMessage = (message) => {
  console.log(styleText('blue', 'Info:'), `${message}`);
};

export const printErrorMessage = (message) => {
  console.log(styleText('red', 'Error:'), `${message}`);
};

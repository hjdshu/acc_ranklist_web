const { execSync } = require('child_process');
const path = require('path');
const packageJson = require('./package.json');
const fs = require('fs');
const build = () => {
    const buildCommand = `npm run pkg`;
    execSync(buildCommand, { stdio: 'inherit' });
    const outputPath = path.join(__dirname, 'dist', `${packageJson.name}.exe`);
    // rename the exe file, add the version number
    const version = packageJson.version;
    const newOutputPath = path.join(__dirname, 'dist', `${packageJson.name}-v${version}.exe`);
    fs.renameSync(outputPath, newOutputPath);
    // copy the config.yaml file to the dist folder 
    const configPath = path.join(__dirname, 'config.yaml');
    const newConfigPath = path.join(__dirname, 'dist', 'config.yaml');
    fs.copyFileSync(configPath, newConfigPath);
}

build();
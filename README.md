
# Electron-webpack-forge 

>forked from [@electron-forge/plugin-webpack](https://github.com/electron-userland/electron-forge/tree/master/packages/plugin/webpack)

#### Installation:
 - for yarn:
  ```yarn add -D https://github.com/Danzo7/electron-forge-webpack#dist``` 
  - for npm:
  ```npm install -D https://github.com/Danzo7/electron-forge-webpack#dist```
  
This package has the same functionality of [`@electron-forge/plugin-webpack`](https://github.com/electron-userland/electron-forge/tree/master/packages/plugin/webpack) with additional options.
#### Added options:

|options|type|description|
|----|----|----|
|`output`|`string`|Used to specify the name of the output folder `default:".webpack"`|
|`isMain`|`boolean`|If false the output files will be generated inside a folder named after entry name, else files will be generated directly in the output folder`default:"false"`|

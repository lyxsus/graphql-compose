/* @flow */

import { GraphQLObjectType, GraphQLSchema, getNamedType } from 'graphql';
import TypeComposer from './typeComposer';
import type ResolverList from './resolver/resolverList';
import type Resolver from './resolver/resolver';
import type InputTypeComposer from './inputTypeComposer';


export default class ComposeStorage {
  types: { [typeName: string]: TypeComposer };

  constructor() {
    this.types = {};
  }

  has(typeName: string): boolean {
    return !!this.types[typeName];
  }

  add(typeComposer: TypeComposer): void {
    if (!(typeComposer instanceof TypeComposer)) {
      throw new Error('You must provide instance of TypeComposer');
    }

    this.types[typeComposer.getTypeName()] = typeComposer;
  }

  clear(): void {
    this.types = {};
  }

  get(typeName: string): TypeComposer {
    if (!this.has(typeName)) {
      const gqType = new GraphQLObjectType({
        name: typeName,
        fields: () => ({}),
      });
      this.types[typeName] = new TypeComposer(gqType);
    }
    return this.types[typeName];
  }

  rootQuery(): TypeComposer {
    return this.get('RootQuery');
  }

  rootMutation(): TypeComposer {
    return this.get('RootMutation');
  }

  resolvers(typeName: string): ResolverList {
    return this.get(typeName).getResolvers();
  }

  resolver(typeName: string, resolverName: string): Resolver | void {
    return this.get(typeName).getResolver(resolverName);
  }

  buildSchema() {
    const roots = {};

    if (this.has('RootQuery')) {
      const tc = this.get('RootQuery');
      this.removeEmptyTypes(tc);
      this.buildRelations(tc, new Set());
      roots.query = tc.getType();
    }

    if (this.has('RootMutation')) {
      const tc = this.get('RootMutation');
      this.removeEmptyTypes(tc);
      roots.mutation = tc.getType();
    }

    if (Object.keys(roots).length === 0) {
      throw new Error('Can not build schema. Must be initialized at least one '
      + 'of the following types: RootQuery, RootMutation.');
    }

    return new GraphQLSchema(roots);
  }

  buildRelations(typeComposer: TypeComposer, createdRelations: Set<string>) {
    const relations = typeComposer.getRelations();
    const relationFieldNames = Object.keys(relations);

    relationFieldNames.forEach(relationFieldName => {
      const typeAndField = `${typeComposer.getTypeName()}.${relationFieldName}`;

      const existedField = typeComposer.getField(relationFieldName);
      if (existedField && !existedField._gqcIsRelation) {
        if (!createdRelations.has(typeAndField)) {
          console.log(`GQC: Skip building relation '${typeAndField}', `
                    + `cause this type already has field with such name. `
                    + 'If you want create relation, you should remove this '
                    + 'field before run the schema build.');
        }
      } else {
        createdRelations.add(typeAndField);
        typeComposer.buildRelation(relationFieldName);
      }
    });

    const fields = typeComposer.getFields();
    Object.keys(fields).forEach(fieldName => {
      const typeAndField = `${typeComposer.getTypeName()}.${fieldName}`;
      const fieldType = getNamedType(fields[fieldName].type);
      if (fieldType instanceof GraphQLObjectType && !createdRelations.has(typeAndField)) {
        createdRelations.add(typeAndField);
        this.buildRelations(new TypeComposer(fieldType), createdRelations);
      }
    });
  }

  removeEmptyTypes(typeComposer: TypeComposer | InputTypeComposer) {
    const fields = typeComposer.getFields();
    Object.keys(fields).forEach(fieldName => {
      const fieldType = fields[fieldName].type;
      if (fieldType instanceof GraphQLObjectType) {
        const tc = new TypeComposer(fieldType);
        if (Object.keys(tc.getFields()).length > 0) {
          this.removeEmptyTypes(tc);
        } else {
          console.log(`GQC: Delete field '${typeComposer.getTypeName()}.${fieldName}' `
                    + `with type '${tc.getTypeName()}', cause it does not have fields.`)
          delete fields[fieldName];
        }
      }
    });
    typeComposer.setFields(fields);
  }
}
